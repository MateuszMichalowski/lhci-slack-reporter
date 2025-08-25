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
    throttlingMethod: string,
    locale: string,
    lighthouseConfig: string | undefined,
    cpuSlowdownMultiplier: number | undefined,
    disableCpuThrottling: boolean,
    maxWaitForFcp: number,
    maxRetries: number = 2
): Promise<LighthouseResult> {
    core.info(`Running Lighthouse for URL: ${url}, Device: ${deviceType}`);

    const outputDir = path.resolve(process.cwd(), 'lighthouse-results');
    const baseOutputName = `${encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, '_'))}-${deviceType}`;
    const outputPath = path.join(outputDir, baseOutputName);
    const outputFile = path.join(outputDir, `${baseOutputName}.json`);
    const htmlOutputFile = path.join(outputDir, `${baseOutputName}.html`);

    core.debug(`Output directory: ${outputDir}`);
    core.debug(`Base output path: ${outputPath}`);
    core.debug(`Expected JSON output file: ${outputPath}.report.json`);
    core.debug(`Expected HTML output file: ${outputPath}.report.html`);

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

    const sanitizedChromeFlags = chromeFlags.replace(/"/g, '\\"').replace(/;/g, '');

    const effectiveThrottlingMethod = throttlingMethod;
    let cpuThrottlingArgs = '';
    
    if (disableCpuThrottling) {
        cpuThrottlingArgs = '--throttling.cpuSlowdownMultiplier=1';
        core.debug(`CPU throttling disabled for ${deviceType} (network throttling: ${throttlingMethod})`);
    } else if (cpuSlowdownMultiplier !== undefined) {
        cpuThrottlingArgs = `--throttling.cpuSlowdownMultiplier=${cpuSlowdownMultiplier}`;
        core.debug(`Using custom CPU slowdown multiplier: ${cpuSlowdownMultiplier}x for ${deviceType}`);
    } else if (deviceType === 'desktop') {
        cpuThrottlingArgs = '--throttling.cpuSlowdownMultiplier=1';
    }
    
    const command = [
        'npx',
        'lighthouse@latest',
        `"${url.replace(/"/g, '\\"')}"`,
        '--output=json,html',
        `--output-path=${outputPath}`,
        deviceType === 'desktop' ? '--preset=desktop' : '',
        `--only-categories=${categoriesArg}`,
        `--chrome-flags="${sanitizedChromeFlags}"`,
        `--max-wait-for-load=${timeout * 1000}`,
        `--max-wait-for-fcp=${maxWaitForFcp}`,
        '--timeout=' + (timeout * 1000),
        '--gather-mode=navigation',
        deviceType === 'mobile' ? `--throttling-method=${effectiveThrottlingMethod}` : '--throttling-method=provided',
        cpuThrottlingArgs,
        `--locale=${locale}`,
        '--screenEmulation.mobile=' + (deviceType === 'mobile' ? 'true' : 'false'),
        '--screenEmulation.width=' + (deviceType === 'mobile' ? '360' : '1350'),
        '--screenEmulation.height=' + (deviceType === 'mobile' ? '640' : '940'),
        '--screenEmulation.deviceScaleFactor=' + (deviceType === 'mobile' ? '2' : '1'),
        '--screenEmulation.disabled=false',
        deviceType === 'desktop' ? '--form-factor=desktop' : '--form-factor=mobile',
        deviceType === 'desktop' ? '--emulated-form-factor=desktop' : '--emulated-form-factor=mobile',
        '--quiet',
        '--no-enable-error-reporting',
        lighthouseConfig ? `--config-path="${lighthouseConfig}"` : ''
    ].filter(Boolean).join(' ');

    core.debug(`Executing command: ${command}`);

    let lastError = null;
    let retryDelay = 3000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
            core.warning(`Retry attempt ${attempt}/${maxRetries} for URL: ${url}, Device: ${deviceType}`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryDelay *= 1.5;
        }

        try {
            const { stdout, stderr } = await execPromise(command);
            core.debug(`Command stdout: ${stdout}`);

            if (stderr) {
                core.debug(`Command stderr: ${stderr}`);
            }

            if (!fs.existsSync(outputDir)) {
                core.warning(`Output directory does not exist after test: ${outputDir}`);
                continue;
            }

            const files = fs.readdirSync(outputDir);
            core.debug(`Files in output directory: ${files.join(', ')}`);

            const expectedJsonFile = `${baseOutputName}.report.json`;
            const expectedHtmlFile = `${baseOutputName}.report.html`;
            
            const jsonFilePath = path.join(outputDir, expectedJsonFile);
            const htmlFilePath = path.join(outputDir, expectedHtmlFile);

            if (!fs.existsSync(jsonFilePath)) {
                core.error(`Expected JSON file not found: ${jsonFilePath}`);
                core.debug(`Files in directory: ${fs.readdirSync(outputDir).join(', ')}`);
                throw new Error(`JSON output file not found: ${expectedJsonFile} in ${outputDir}`);
            }

            core.debug(`Found JSON result file: ${jsonFilePath}`);

            try {
                const rawResults = fs.readFileSync(jsonFilePath, 'utf8');
                core.debug(`Raw results file content (first 200 chars): ${rawResults.substring(0, 200)}...`);

                const results = JSON.parse(rawResults);

                if (!results.categories) {
                    throw new Error(`Invalid Lighthouse results: missing 'categories' property`);
                }

                let reportUrl = '';
                if (fs.existsSync(htmlFilePath)) {
                    core.debug(`Found HTML report file: ${htmlFilePath}`);
                    reportUrl = htmlFilePath;
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
 * Average multiple Lighthouse results for the same URL/device
 */
function averageLighthouseResults(results: LighthouseResult[]): LighthouseResult {
    if (results.length === 0) {
        throw new Error('No results to average');
    }
    
    if (results.length === 1) {
        return results[0];
    }
    
    const categoryScores: Record<string, number[]> = {};
    
    results.forEach(result => {
        result.categories.forEach(category => {
            if (!categoryScores[category.id]) {
                categoryScores[category.id] = [];
            }
            categoryScores[category.id].push(category.score);
        });
    });
    
    const averagedCategories: LighthouseCategory[] = [];
    for (const [id, scores] of Object.entries(categoryScores)) {
        const sorted = scores.sort((a, b) => a - b);
        const median = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];
        
        const firstResult = results[0].categories.find(c => c.id === id);
        if (firstResult) {
            averagedCategories.push({
                id,
                title: firstResult.title,
                score: median
            });
        }
    }
    
    return {
        url: results[0].url,
        deviceType: results[0].deviceType,
        categories: averagedCategories,
        reportUrl: results[0].reportUrl
    };
}

/**
 * Run Lighthouse tests for all URLs and device types
 */
export async function runLighthouseTests(
    urls: string[],
    deviceTypes: string[],
    categories: string[],
    chromeFlags: string,
    timeout: number,
    throttlingMethod: string = 'simulate',
    locale: string = 'en-US',
    runsPerUrl: number = 1,
    lighthouseConfig?: string,
    cpuSlowdownMultiplier?: number,
    disableCpuThrottling: boolean = false,
    desktopTimeout?: number,
    maxWaitForFcp: number = 30000
): Promise<LighthouseResult[]> {
    const results: LighthouseResult[] = [];
    const errors: Error[] = [];

    core.info(`Starting Lighthouse tests for ${urls.length} URLs on ${deviceTypes.length} device types`);
    if (runsPerUrl > 1) {
        core.info(`Will run ${runsPerUrl} tests per URL/device and average the results`);
    }

    const sanitizedChromeFlags = chromeFlags.replace(/"/g, '\\"');

    const BATCH_SIZE = 3;

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const urlBatch = urls.slice(i, i + BATCH_SIZE);

        const batchPromises = urlBatch.flatMap(url =>
            deviceTypes.map(async (deviceType) => {
                const runResults: LighthouseResult[] = [];
                
                for (let run = 1; run <= runsPerUrl; run++) {
                    try {
                        if (runsPerUrl > 1) {
                            core.info(`Testing ${url} on ${deviceType} (run ${run}/${runsPerUrl})...`);
                        } else {
                            core.info(`Testing ${url} on ${deviceType}...`);
                        }
                        
                        const effectiveTimeout = (deviceType === 'desktop' && desktopTimeout) ? desktopTimeout : timeout;
                        
                        const result = await runLighthouseForUrl(
                            url, 
                            deviceType, 
                            categories, 
                            sanitizedChromeFlags, 
                            effectiveTimeout,
                            throttlingMethod,
                            locale,
                            lighthouseConfig,
                            cpuSlowdownMultiplier,
                            disableCpuThrottling,
                            maxWaitForFcp,
                            2
                        );
                        runResults.push(result);
                        
                        if (runsPerUrl > 1) {
                            core.info(`✅ Completed run ${run}/${runsPerUrl} for ${url} on ${deviceType}`);
                        }
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        core.warning(`Failed run ${run}/${runsPerUrl} for ${url} on ${deviceType}: ${errorMessage}`);
                        if (run === runsPerUrl && runResults.length === 0) {
                            errors.push(error instanceof Error ? error : new Error(String(error)));
                            return error;
                        }
                    }
                }
                
                if (runResults.length > 0) {
                    const averagedResult = averageLighthouseResults(runResults);
                    results.push(averagedResult);
                    core.info(`✅ Completed test for ${url} on ${deviceType} (averaged from ${runResults.length} runs)`);
                    return null;
                } else {
                    return new Error(`All runs failed for ${url} on ${deviceType}`);
                }
            })
        );

        await Promise.all(batchPromises);
    }

    core.info(`Completed Lighthouse tests: ${results.length} successful, ${errors.length} failed`);

    if (results.length === 0) {
        if (errors.length > 0) {
            throw new Error(`All Lighthouse tests failed: ${errors.map(e => e.message).join(', ')}`);
        }
        throw new Error('No Lighthouse tests were completed successfully');
    }

    return results;
}
