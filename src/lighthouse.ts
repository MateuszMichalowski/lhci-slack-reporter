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

    const outputDir = path.join(process.cwd(), 'lighthouse-results');
    const outputFile = path.join(outputDir, `${encodeURIComponent(url)}-${deviceType}.json`);
    const htmlOutputFile = path.join(outputDir, `${encodeURIComponent(url)}-${deviceType}.html`);

    // Ensure the output directory exists
    if (!fs.existsSync(outputDir)) {
        try {
            fs.mkdirSync(outputDir, { recursive: true });
            core.debug(`Created output directory: ${outputDir}`);
        } catch (err) {
            core.error(`Failed to create output directory: ${err}`);
            throw new Error(`Failed to create output directory: ${err}`);
        }
    }

    const categoriesArg = categories.join(',');

    const lhciBin = require.resolve('@lhci/cli/src/cli.js');

    const quotedUrl = `"${url}"`;

    const command = [
        'node',
        lhciBin,
        'collect',
        `--url=${quotedUrl}`,
        '--output=json',
        `--outputPath="${outputFile}"`,
        deviceType === 'desktop' ? '--preset=desktop' : '',
        `--onlyCategories="${categoriesArg}"`,
        `--chromeFlags="${chromeFlags}"`,
        `--maxWaitForLoad=${timeout * 1000}`,
        deviceType === 'desktop' ? '--formFactor=desktop' : '--formFactor=mobile',
        `--screenEmulation.width=${deviceType === 'desktop' ? 1350 : 360}`,
        `--screenEmulation.height=${deviceType === 'desktop' ? 940 : 640}`,
        `--screenEmulation.deviceScaleFactor=${deviceType === 'desktop' ? 1 : 2.625}`,
        `--screenEmulation.mobile=${deviceType === 'desktop' ? 'false' : 'true'}`,
        `--htmlPath="${htmlOutputFile}"`
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

            if (!fs.existsSync(outputFile)) {
                throw new Error(`Output file not found: ${outputFile}`);
            }

            try {
                const rawResults = fs.readFileSync(outputFile, 'utf8');
                core.debug(`Raw results file content (first 200 chars): ${rawResults.substring(0, 200)}...`);

                const results = JSON.parse(rawResults);

                if (!results.categories) {
                    throw new Error(`Invalid Lighthouse results: missing 'categories' property`);
                }

                core.info(`Successfully ran Lighthouse for URL: ${url}, Device: ${deviceType}`);

                const lighthouseCategories: LighthouseCategory[] = Object.entries(results.categories).map(
                    ([id, category]: [string, any]) => ({
                        id,
                        title: category.title,
                        score: category.score
                    })
                );

                const reportUrl = path.relative(process.cwd(), htmlOutputFile);

                return {
                    url,
                    deviceType,
                    categories: lighthouseCategories,
                    reportUrl
                };
            } catch (parseError) {
                throw new Error(`Failed to parse Lighthouse results: ${(parseError as Error).message}`);
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
