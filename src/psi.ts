import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { LighthouseResult, LighthouseCategory } from './utils';

const PSI_API_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

interface PSICategory {
    id: string;
    title: string;
    score: number;
}

interface PSIResponse {
    lighthouseResult: {
        categories: {
            performance?: PSICategory;
            accessibility?: PSICategory;
            'best-practices'?: PSICategory;
            seo?: PSICategory;
            pwa?: PSICategory;
        };
        audits: Record<string, any>;
        configSettings: {
            formFactor: string;
            screenEmulation: any;
            throttling: any;
        };
    };
    loadingExperience?: any;
    originLoadingExperience?: any;
    id: string;
}

/**
 * Extract categories from PSI response
 */
function extractCategories(psiResult: PSIResponse['lighthouseResult']): LighthouseCategory[] {
    const categories: LighthouseCategory[] = [];
    
    if (psiResult.categories.performance) {
        categories.push({
            id: 'performance',
            title: psiResult.categories.performance.title || 'Performance',
            score: psiResult.categories.performance.score
        });
    }
    
    if (psiResult.categories.accessibility) {
        categories.push({
            id: 'accessibility',
            title: psiResult.categories.accessibility.title || 'Accessibility',
            score: psiResult.categories.accessibility.score
        });
    }
    
    if (psiResult.categories['best-practices']) {
        categories.push({
            id: 'best-practices',
            title: psiResult.categories['best-practices'].title || 'Best Practices',
            score: psiResult.categories['best-practices'].score
        });
    }
    
    if (psiResult.categories.seo) {
        categories.push({
            id: 'seo',
            title: psiResult.categories.seo.title || 'SEO',
            score: psiResult.categories.seo.score
        });
    }
    
    // PWA category was removed in Lighthouse 12.0 (May 2024)
    if (psiResult.categories.pwa) {
        categories.push({
            id: 'pwa',
            title: psiResult.categories.pwa.title || 'PWA',
            score: psiResult.categories.pwa.score
        });
    }
    
    return categories;
}

/**
 * Run a single PSI test for a URL and device type
 */
async function runPSITest(
    url: string,
    deviceType: string,
    categories: string[],
    apiKey: string,
    locale: string = 'en-GB',
    maxRetries: number = 3
): Promise<LighthouseResult> {
    core.info(`Running PSI test for URL: ${url}, Device: ${deviceType}`);
    
    // Create output directory for PSI results
    const outputDir = path.resolve(process.cwd(), 'lighthouse-results');
    if (!fs.existsSync(outputDir)) {
        try {
            fs.mkdirSync(outputDir, { recursive: true });
            core.debug(`Created output directory: ${outputDir}`);
        } catch (err) {
            core.error(`Failed to create output directory: ${err}`);
        }
    }
    
    const params = new URLSearchParams({
        url: url,
        strategy: deviceType === 'mobile' ? 'mobile' : 'desktop',
        key: apiKey,
        locale: locale,
        utm_source: 'lhci-github-action',
        utm_campaign: 'automated-testing'
    });
    
    categories.forEach(category => {
        params.append('category', category);
    });
    
    const apiUrl = `${PSI_API_URL}?${params.toString()}`;
    
    let lastError: Error | null = null;
    let retryDelay = 2000; // Start with 2 second delay
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) {
            core.info(`  Retry attempt ${attempt}/${maxRetries - 1} for ${url} on ${deviceType}`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryDelay = Math.min(retryDelay * 1.5, 10000); // Exponential backoff, max 10s
        }
        
        try {
            core.debug(`Calling PSI API: ${apiUrl.replace(apiKey, 'REDACTED')}`);
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                const error = new Error(`PSI API error: ${response.status} - ${errorText}`);
                
                if (response.status === 429 || response.status >= 500) {
                    lastError = error;
                    if (attempt < maxRetries - 1) {
                        core.warning(`  API returned ${response.status}, will retry...`);
                        continue;
                    }
                }
                throw error;
            }
            
            const data = await response.json() as PSIResponse;
            
            // Save raw PSI response to file
            const outputFile = path.join(outputDir, `psi-${encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, '_'))}-${deviceType}.json`);
            try {
                fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
                core.info(`  Saved PSI results to: ${outputFile}`);
            } catch (err) {
                core.warning(`Failed to save PSI results to file: ${err}`);
            }
            
            const result: LighthouseResult = {
                url: url,
                deviceType: deviceType,
                categories: extractCategories(data.lighthouseResult),
                reportUrl: `https://pagespeed.web.dev/report?url=${encodeURIComponent(url)}`
            };
            
            result.categories.forEach(cat => {
                core.info(`  ${cat.title}: ${Math.round(cat.score * 100)}`);
            });
            
            return result;
            
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt === maxRetries - 1) {
                core.error(`PSI test failed for ${url} on ${deviceType} after ${maxRetries} attempts: ${lastError.message}`);
                throw lastError;
            }
        }
    }
    
    // This should never be reached, but TypeScript needs it
    throw lastError || new Error(`Failed to run PSI test for ${url} on ${deviceType}`);
}

/**
 * Average multiple PSI results for the same URL/device using median
 */
function averagePSIResults(results: LighthouseResult[]): LighthouseResult {
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
 * Run PSI tests for all URLs and device types
 */
export async function runPSITests(
    urls: string[],
    deviceTypes: string[],
    categories: string[],
    apiKey: string,
    locale: string = 'en-GB',
    runsPerUrl: number = 1
): Promise<LighthouseResult[]> {
    const results: LighthouseResult[] = [];
    const errors: Error[] = [];
    
    core.info(`Starting PSI tests for ${urls.length} URLs on ${deviceTypes.length} device types`);
    core.info(`Using PageSpeed Insights API for consistent, reliable scoring`);
    core.info(`Configuration: Locale=${locale}, Runs per URL=${runsPerUrl}`);
    if (runsPerUrl > 1) {
        core.info(`Will run ${runsPerUrl} tests per URL/device and use median scores`);
    }
    
    if (!apiKey) {
        throw new Error('PSI API key is required when use_psi_api is enabled');
    }
    
    for (const url of urls) {
        for (const deviceType of deviceTypes) {
            const runResults: LighthouseResult[] = [];
            
            for (let run = 1; run <= runsPerUrl; run++) {
                try {
                    if (runsPerUrl > 1) {
                        core.info(`Testing ${url} on ${deviceType} (run ${run}/${runsPerUrl})...`);
                    } else {
                        core.info(`Testing ${url} on ${deviceType}...`);
                    }
                    
                    const result = await runPSITest(
                        url,
                        deviceType,
                        categories,
                        apiKey,
                        locale,
                        3 // max retries
                    );
                    
                    runResults.push(result);
                    
                    if (runsPerUrl > 1 && run < runsPerUrl) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    core.warning(`Failed run ${run}/${runsPerUrl} for ${url} on ${deviceType}: ${errorMessage}`);
                    
                    if (run === runsPerUrl && runResults.length === 0) {
                        errors.push(error instanceof Error ? error : new Error(String(error)));
                    }
                }
            }
            
            if (runResults.length > 0) {
                const averagedResult = averagePSIResults(runResults);
                results.push(averagedResult);
                
                // Save averaged results to file if multiple runs
                if (runsPerUrl > 1) {
                    const outputDir = path.resolve(process.cwd(), 'lighthouse-results');
                    const avgOutputFile = path.join(outputDir, `psi-averaged-${encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, '_'))}-${deviceType}.json`);
                    try {
                        const avgData = {
                            url: url,
                            deviceType: deviceType,
                            runsCompleted: runResults.length,
                            totalRuns: runsPerUrl,
                            averagedScores: averagedResult.categories,
                            individualRuns: runResults.map(r => r.categories)
                        };
                        fs.writeFileSync(avgOutputFile, JSON.stringify(avgData, null, 2));
                        core.info(`  Saved averaged PSI results to: ${avgOutputFile}`);
                    } catch (err) {
                        core.warning(`Failed to save averaged PSI results: ${err}`);
                    }
                    core.info(`✅ Completed PSI test for ${url} on ${deviceType} (averaged from ${runResults.length} successful runs)`);
                } else {
                    core.info(`✅ Completed PSI test for ${url} on ${deviceType}`);
                }
            } else {
                core.error(`❌ All ${runsPerUrl} runs failed for ${url} on ${deviceType}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    core.info(`Completed PSI tests: ${results.length} successful, ${errors.length} failed`);
    
    if (results.length === 0) {
        if (errors.length > 0) {
            throw new Error(`All PSI tests failed: ${errors.map(e => e.message).join(', ')}`);
        }
        throw new Error('No PSI tests were completed successfully');
    }
    
    return results;
}

/**
 * Check if PSI API is available and configured
 */
export function isPSIAvailable(apiKey?: string): boolean {
    return !!apiKey && apiKey.length > 0;
}
