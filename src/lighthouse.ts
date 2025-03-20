import * as core from '@actions/core';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { LighthouseResult, LighthouseCategory } from './utils';

const execPromise = util.promisify(exec);

/**
 * Run Lighthouse CI for a single URL and device type
 */
async function runLighthouseForUrl(
    url: string,
    deviceType: string,
    categories: string[],
    chromeFlags: string,
    timeout: number,
    maxRetries: number = 1
): Promise<LighthouseResult> {
    core.info(`Running Lighthouse for URL: ${url}, Device: ${deviceType}`);

    const outputDir = path.resolve(process.cwd(), 'lighthouse-results');
    const outputFile = path.join(outputDir, `${encodeURIComponent(url)}-${deviceType}.json`);
    const htmlOutputFile = path.join(outputDir, `${encodeURIComponent(url)}-${deviceType}.html`);

    core.debug(`Output directory: ${outputDir}`);
    core.debug(`JSON output file: ${outputFile}`);
    core.debug(`HTML output file: ${htmlOutputFile}`);

    if (!fs.existsSync(outputDir)) {
        try {
            fs.mkdirSync(outputDir, { recursive: true });
            core.debug(`Created output directory: ${outputDir}`);
        } catch (err) {
            core.error(`Failed to create output directory: ${err}`);
            throw new Error(`Failed to create output directory: ${err}`);
        }
    }

    try {
        const testFile = path.join(outputDir, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        core.debug('Output directory is writable');
    } catch (err) {
        core.error(`Output directory is not writable: ${err}`);
        throw new Error(`Output directory is not writable: ${err}`);
    }

    const categoriesArg = categories.join(',');

    const command = [
        'npx',
        'lighthouse@latest',
        url,
        '--output=json,html',
        `--output-path=${outputFile}`,
        deviceType === 'desktop' ? '--preset=desktop' : '',
        `--only-categories=${categoriesArg}`,
        `--chrome-flags="${chromeFlags}"`,
        `--max-wait-for-load=${timeout * 1000}`,
        deviceType === 'desktop' ? '--form-factor=desktop' : '--form-factor=mobile',
        deviceType === 'desktop' ? '--emulated-form-factor=desktop' : '--emulated-form-factor=mobile'
    ].filter(Boolean).join(' ');

    core.debug(`Executing command: ${command}`);

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
            core.warning(`Retry attempt ${attempt}/${maxRetries} for URL: ${url}, Device: ${deviceType}`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        try {
            const { stdout, stderr } = await execPromise(command);
            core.debug(`Command stdout: ${stdout}`);

            if (stderr) {
                core.debug(`Command stderr: ${stderr}`);
            }

            if (fs.existsSync(outputDir)) {
                const files = fs.readdirSync(outputDir);
                core.debug(`Files in output directory: ${files.join(', ')}`);
            } else {
                core.warning(`Output directory does not exist after test: ${outputDir}`);
            }

            const baseOutputName = path.basename(outputFile, '.json');
            const jsonPattern = new RegExp(`${baseOutputName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\.json$`);

            const jsonFiles = fs.readdirSync(outputDir)
                .filter(file => jsonPattern.test(file));

            if (jsonFiles.length === 0) {
                throw new Error(`No JSON output files found matching pattern in ${outputDir}`);
            }

            jsonFiles.sort((a, b) => {
                return fs.statSync(path.join(outputDir, b)).mtime.getTime() -
                    fs.statSync(path.join(outputDir, a)).mtime.getTime();
            });

            const newestJsonFile = path.join(outputDir, jsonFiles[0]);
            core.debug(`Found JSON result file: ${newestJsonFile}`);

            try {
                const rawResults = fs.readFileSync(newestJsonFile, 'utf8');
                core.debug(`Raw results file content (first 200 chars): ${rawResults.substring(0, 200)}...`);

                const results = JSON.parse(rawResults);

                if (!results.categories) {
                    throw new Error(`Invalid Lighthouse results: missing 'categories' property`);
                }

                const htmlPattern = new RegExp(`${baseOutputName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\.html$`);
                const htmlFiles = fs.readdirSync(outputDir)
                    .filter(file => htmlPattern.test(file));

                let reportUrl = '';
                if (htmlFiles.length > 0) {
                    htmlFiles.sort((a, b) => {
                        return fs.statSync(path.join(outputDir, b)).mtime.getTime() -
                            fs.statSync(path.join(outputDir, a)).mtime.getTime();
                    });

                    const newestHtmlFile = path.join(outputDir, htmlFiles[0]);
                    core.debug(`Found HTML report file: ${newestHtmlFile}`);

                    reportUrl = newestHtmlFile;
                } else {
                    core.warning(`No HTML report found for ${url} on ${deviceType}`);
                }

                core.info(`Successfully ran Lighthouse for URL: ${url}, Device: ${deviceType}`);

                const lighthouseCategories: LighthouseCategory[] = Object.entries(results.categories).map(
                    ([id, category]: [string, any]) => ({
                        id,
                        title: category.title,
                        score: category.score
                    })
                );

                return {
                    url,
                    deviceType,
                    categories: lighthouseCategories,
                    reportUrl
                };
            } catch (parseError) {
                const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                core.error(`Failed to parse Lighthouse results: ${errorMessage}`);
                throw new Error(`Failed to parse Lighthouse results: ${errorMessage}`);
            }
        } catch (error) {
            lastError = error;
            const errorMessage = error instanceof Error ? error.message : String(error);
            core.warning(`Attempt ${attempt + 1} failed: ${errorMessage}`);

            if (attempt < maxRetries) {
                continue;
            }
        }
    }

    core.error(`Failed to run Lighthouse for URL: ${url}, Device: ${deviceType}`);
    if (lastError) {
        if (lastError instanceof Error) {
            core.error(lastError.message);
            if ('stderr' in lastError) {
                core.error(`stderr: ${(lastError as any).stderr}`);
            }
        } else {
            core.error(String(lastError));
        }
    }

    throw lastError || new Error(`Failed to run Lighthouse for URL: ${url}, Device: ${deviceType}`);
}

/**
 * Run Lighthouse tests for all URLs and device types
 */
export async function runLighthouseTests(
    urls: string[],
    deviceTypes: string[],
    categories: string[],
    chromeFlags: string,
    timeout: number
): Promise<LighthouseResult[]> {
    const results: LighthouseResult[] = [];
    const errors: Error[] = [];

    core.info(`Starting Lighthouse tests for ${urls.length} URLs on ${deviceTypes.length} device types`);

    const sanitizedChromeFlags = chromeFlags.replace(/"/g, '\\"');

    for (const url of urls) {
        for (const deviceType of deviceTypes) {
            try {
                core.info(`Testing ${url} on ${deviceType}...`);
                const result = await runLighthouseForUrl(url, deviceType, categories, sanitizedChromeFlags, timeout, 2);
                results.push(result);
                core.info(`Completed test for ${url} on ${deviceType}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                core.warning(`Failed to test ${url} on ${deviceType}: ${errorMessage}`);
                errors.push(error instanceof Error ? error : new Error(String(error)));
                // Continue with other tests even if one fails
            }
        }
    }

    core.info(`Completed Lighthouse tests: ${results.length} successful, ${errors.length} failed`);

    if (results.length === 0 && errors.length > 0) {
        throw new Error(`All Lighthouse tests failed: ${errors.map(e => e.message).join(', ')}`);
    }

    return results;
}
