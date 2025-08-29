import * as core from '@actions/core';
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
    apiKey: string
): Promise<LighthouseResult> {
    core.info(`Running PSI test for URL: ${url}, Device: ${deviceType}`);
    
    const params = new URLSearchParams({
        url: url,
        strategy: deviceType === 'mobile' ? 'mobile' : 'desktop',
        key: apiKey
    });
    
    categories.forEach(category => {
        params.append('category', category);
    });
    
    const apiUrl = `${PSI_API_URL}?${params.toString()}`;
    
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
            throw new Error(`PSI API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json() as PSIResponse;
        
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
        core.error(`PSI test failed for ${url} on ${deviceType}: ${error}`);
        throw error;
    }
}

/**
 * Run PSI tests for all URLs and device types
 */
export async function runPSITests(
    urls: string[],
    deviceTypes: string[],
    categories: string[],
    apiKey: string
): Promise<LighthouseResult[]> {
    const results: LighthouseResult[] = [];
    const errors: Error[] = [];
    
    core.info(`Starting PSI tests for ${urls.length} URLs on ${deviceTypes.length} device types`);
    core.info(`Using PageSpeed Insights API for consistent, reliable scoring`);
    
    if (!apiKey) {
        throw new Error('PSI API key is required when use_psi_api is enabled');
    }
    
    for (const url of urls) {
        for (const deviceType of deviceTypes) {
            try {
                core.info(`Testing ${url} on ${deviceType}...`);
                
                const result = await runPSITest(
                    url,
                    deviceType,
                    categories,
                    apiKey
                );
                
                results.push(result);
                core.info(`✅ Completed PSI test for ${url} on ${deviceType}`);
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                core.warning(`Failed PSI test for ${url} on ${deviceType}: ${errorMessage}`);
                errors.push(error instanceof Error ? error : new Error(String(error)));
            }
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
