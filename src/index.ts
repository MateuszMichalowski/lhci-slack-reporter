import * as core from '@actions/core';
import { runLighthouseTests } from './lighthouse';
import { sendSlackReport } from './slack';
import { parseInputArray, formatLighthouseResults, validateInputs } from './utils';
import * as fs from 'fs';

async function run(): Promise<void> {
    try {
        core.info('🚀 Starting Lighthouse CI Slack Reporter action');

        validateInputs();

        const urls = parseInputArray(core.getInput('urls', { required: true }));
        const deviceTypes = parseInputArray(core.getInput('device_types') || 'mobile,desktop');
        const categories = parseInputArray(core.getInput('categories') || 'performance,accessibility,best-practices,seo');
        const slackTitle = core.getInput('slack_title') || 'Lighthouse Test Results';
        const failOnScoreBelowInput = core.getInput('fail_on_score_below') || '0';
        const failOnScoreBelow = parseInt(failOnScoreBelowInput) / 100; // Convert to 0-1 scale
        const chromeFlags = core.getInput('chrome_flags') || '--no-sandbox --headless --disable-gpu';
        const timeoutInput = core.getInput('timeout') || '60';
        const timeout = parseInt(timeoutInput);

        core.info(`📋 Configuration:`);
        core.info(`  - URLs: ${urls.join(', ')}`);
        core.info(`  - Device types: ${deviceTypes.join(', ')}`);
        core.info(`  - Test categories: ${categories.join(', ')}`);
        core.info(`  - Fail on score below: ${failOnScoreBelow * 100}%`);

        core.info('🔍 Running Lighthouse tests...');
        let lighthouseResults;

        try {
            if (fs.existsSync('lighthouse-results/example.json')) {
                core.info('📋 Found mock lighthouse results, using those for local testing');
                const mockResult = JSON.parse(fs.readFileSync('lighthouse-results/example.json', 'utf8'));
                const categories = Object.entries(mockResult.categories).map(
                    ([id, category]: [string, any]) => ({
                        id,
                        title: category.title,
                        score: category.score
                    })
                );

                lighthouseResults = [
                    {
                        url: mockResult.url,
                        deviceType: 'mobile',
                        categories,
                        reportUrl: 'lighthouse-results/example.html'
                    }
                ];
            } else {
                lighthouseResults = await runLighthouseTests(
                    urls,
                    deviceTypes,
                    categories,
                    chromeFlags,
                    timeout
                );
            }
        } catch (error) {
            core.warning(`Error running lighthouse tests: ${error}`);
            throw error;
        }

        core.info(`✅ Lighthouse tests completed: ${lighthouseResults.length} results`);

        core.info('📊 Formatting results for Slack...');
        const formattedResults = formatLighthouseResults(lighthouseResults);

        core.info('📤 Sending results to Slack...');
        await sendSlackReport(formattedResults, slackTitle);
        core.info('✅ Results sent to Slack successfully');

        const allScores = lighthouseResults.flatMap(result =>
            result.categories.map(category => category.score)
        );

        const lowestScore = Math.min(...allScores);
        core.info(`📉 Lowest score: ${Math.round(lowestScore * 100)}%`);

        if (lowestScore < failOnScoreBelow) {
            core.setFailed(`❌ One or more scores (${Math.round(lowestScore * 100)}%) are below the threshold of ${Math.round(failOnScoreBelow * 100)}%`);
        }

        core.info('🎉 Lighthouse CI Slack Reporter action completed successfully');
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(`❌ ${error.message}`);
        } else {
            core.setFailed(`❌ Unknown error: ${error}`);
        }
    }
}

run();
