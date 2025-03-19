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
    timeout: number
): Promise<LighthouseResult> {
    core.info(`Running Lighthouse for URL: ${url}, Device: ${deviceType}`);

    const outputDir = path.join(process.cwd(), 'lighthouse-results');
    const outputFile = path.join(outputDir, `${encodeURIComponent(url)}-${deviceType}.json`);
    const htmlOutputFile = path.join(outputDir, `${encodeURIComponent(url)}-${deviceType}.html`);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const categoriesArg = categories.join(',');
    const command = [
        'npx', '@lhci/cli@latest', 'collect',
        `--url=${url}`,
        `--output=json`,
        `--outputPath=${outputFile}`,
        `--settings.preset=${deviceType === 'desktop' ? 'desktop' : 'mobile'}`,
        `--settings.onlyCategories=${categoriesArg}`,
        `--settings.chromeFlags="${chromeFlags}"`,
        `--settings.maxWaitForLoad=${timeout * 1000}`,
        `--settings.extraHeaders="{\\\"x-lighthouse-test\\\":\\\"true\\\"}"`,
        `--settings.formFactor=${deviceType}`,
        `--htmlPath=${htmlOutputFile}`
    ].join(' ');

    core.debug(`Executing command: ${command}`);

    try {
        const { stdout, stderr } = await execPromise(command);
        core.debug(`stdout: ${stdout}`);

        if (stderr && !stderr.includes('Storing results')) {
            core.warning(`stderr: ${stderr}`);
        }

        if (!fs.existsSync(outputFile)) {
            throw new Error(`Output file not found: ${outputFile}`);
        }

        const rawResults = fs.readFileSync(outputFile, 'utf8');
        const results = JSON.parse(rawResults);

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
    } catch (error) {
        core.error(`Failed to run Lighthouse for URL: ${url}, Device: ${deviceType}`);
        if (error instanceof Error) {
            core.error(error.message);
            if ('stderr' in error) {
                core.error(`stderr: ${(error as any).stderr}`);
            }
        }
        throw error;
    }
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

    for (const url of urls) {
        for (const deviceType of deviceTypes) {
            try {
                core.info(`Testing ${url} on ${deviceType}...`);
                const result = await runLighthouseForUrl(url, deviceType, categories, chromeFlags, timeout);
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
