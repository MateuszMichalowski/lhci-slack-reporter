import * as core from '@actions/core';

export interface LighthouseCategory {
    id: string;
    title: string;
    score: number;
}

export interface LighthouseResult {
    url: string;
    deviceType: string;
    categories: LighthouseCategory[];
    reportUrl?: string;
}

export interface FormattedLighthouseResults {
    results: LighthouseResult[];
    summary: {
        totalUrls: number;
        totalTests: number;
        averageScores: Record<string, number>;
        scoresByDevice: Record<string, Record<string, number>>;
        scoresByUrl: Record<string, Record<string, number>>;
        minScores: Record<string, number>;
        maxScores: Record<string, number>;
    };
}

/**
 * Parse a comma-separated input string into an array
 */
export function parseInputArray(input: string): string[] {
    core.debug(`Parsing input array: ${input}`);
    return input.split(',').map(item => item.trim()).filter(Boolean);
}

/**
 * Calculate average scores across all results
 */
function calculateAverageScores(results: LighthouseResult[]): Record<string, number> {
    const scoresByCategory: Record<string, number[]> = {};

    results.forEach(result => {
        result.categories.forEach(category => {
            if (!scoresByCategory[category.id]) {
                scoresByCategory[category.id] = [];
            }
            scoresByCategory[category.id].push(category.score);
        });
    });

    const averageScores: Record<string, number> = {};
    for (const [category, scores] of Object.entries(scoresByCategory)) {
        const sum = scores.reduce((a, b) => a + b, 0);
        averageScores[category] = Math.round((sum / scores.length) * 100) / 100;
    }

    core.debug(`Calculated average scores: ${JSON.stringify(averageScores)}`);
    return averageScores;
}

/**
 * Calculate scores by device type
 */
function calculateScoresByDevice(results: LighthouseResult[]): Record<string, Record<string, number>> {
    const deviceTypes = [...new Set(results.map(r => r.deviceType))];
    const scoresByDevice: Record<string, Record<string, number>> = {};

    for (const deviceType of deviceTypes) {
        const deviceResults = results.filter(r => r.deviceType === deviceType);
        scoresByDevice[deviceType] = calculateAverageScores(deviceResults);
    }

    core.debug(`Calculated scores by device: ${JSON.stringify(scoresByDevice)}`);
    return scoresByDevice;
}

/**
 * Calculate scores by URL
 */
function calculateScoresByUrl(results: LighthouseResult[]): Record<string, Record<string, number>> {
    const urls = [...new Set(results.map(r => r.url))];
    const scoresByUrl: Record<string, Record<string, number>> = {};

    for (const url of urls) {
        const urlResults = results.filter(r => r.url === url);
        scoresByUrl[url] = calculateAverageScores(urlResults);
    }

    core.debug(`Calculated scores by URL: ${JSON.stringify(scoresByUrl)}`);
    return scoresByUrl;
}

/**
 * Calculate minimum scores across all results
 */
function calculateMinScores(results: LighthouseResult[]): Record<string, number> {
    const scoresByCategory: Record<string, number[]> = {};

    results.forEach(result => {
        result.categories.forEach(category => {
            if (!scoresByCategory[category.id]) {
                scoresByCategory[category.id] = [];
            }
            scoresByCategory[category.id].push(category.score);
        });
    });

    const minScores: Record<string, number> = {};
    for (const [category, scores] of Object.entries(scoresByCategory)) {
        minScores[category] = Math.min(...scores);
    }

    core.debug(`Calculated min scores: ${JSON.stringify(minScores)}`);
    return minScores;
}

/**
 * Calculate maximum scores across all results
 */
function calculateMaxScores(results: LighthouseResult[]): Record<string, number> {
    const scoresByCategory: Record<string, number[]> = {};

    results.forEach(result => {
        result.categories.forEach(category => {
            if (!scoresByCategory[category.id]) {
                scoresByCategory[category.id] = [];
            }
            scoresByCategory[category.id].push(category.score);
        });
    });

    const maxScores: Record<string, number> = {};
    for (const [category, scores] of Object.entries(scoresByCategory)) {
        maxScores[category] = Math.max(...scores);
    }

    core.debug(`Calculated max scores: ${JSON.stringify(maxScores)}`);
    return maxScores;
}

/**
 * Format lighthouse results for Slack report
 */
export function formatLighthouseResults(results: LighthouseResult[]): FormattedLighthouseResults {
    core.info(`Formatting ${results.length} lighthouse results`);

    const summary = {
        totalUrls: [...new Set(results.map(r => r.url))].length,
        totalTests: results.length,
        averageScores: calculateAverageScores(results),
        scoresByDevice: calculateScoresByDevice(results),
        scoresByUrl: calculateScoresByUrl(results),
        minScores: calculateMinScores(results),
        maxScores: calculateMaxScores(results)
    };

    core.debug(`Summary: ${JSON.stringify(summary)}`);

    return {
        results,
        summary
    };
}

/**
 * Format a number as percentage
 */
export function formatScore(score: number): string {
    return `${Math.round(score * 100)}%`;
}

/**
 * Validate input values
 */
export function validateInputs(): void {
    const urls = parseInputArray(core.getInput('urls', { required: true }));
    if (urls.length === 0) {
        throw new Error('At least one URL must be provided');
    }

    urls.forEach(url => {
        try {
            new URL(url);
        } catch (error) {
            throw new Error(`Invalid URL: ${url}`);
        }
    });

    const deviceTypes = parseInputArray(core.getInput('device_types'));
    deviceTypes.forEach(deviceType => {
        if (deviceType !== 'mobile' && deviceType !== 'desktop') {
            throw new Error(`Invalid device type: ${deviceType}. Must be 'mobile' or 'desktop'`);
        }
    });

    const failOnScoreBelowInput = core.getInput('fail_on_score_below') || '0';
    const failOnScoreBelow = parseInt(failOnScoreBelowInput);
    if (isNaN(failOnScoreBelow) || failOnScoreBelow < 0 || failOnScoreBelow > 100) {
        throw new Error(`Invalid fail_on_score_below value: ${failOnScoreBelowInput}. Must be a number between 0 and 100`);
    }

    const timeoutInput = core.getInput('timeout') || '60';
    const timeout = parseInt(timeoutInput);
    if (isNaN(timeout) || timeout <= 0) {
        throw new Error(`Invalid timeout value: ${timeoutInput}. Must be a positive number`);
    }

    const hasWebhookUrl = !!core.getInput('slack_webhook_url');
    const hasSlackToken = !!core.getInput('slack_token');

    if (!hasWebhookUrl && !hasSlackToken) {
        throw new Error('Either slack_webhook_url or slack_token must be provided');
    }

    core.info('Input validation successful');
}
