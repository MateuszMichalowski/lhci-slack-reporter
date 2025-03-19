import { parseInputArray, formatLighthouseResults, formatScore, validateInputs } from '../utils';

const mockGetInput = jest.fn();
const mockInfo = jest.fn();
const mockDebug = jest.fn();

jest.mock('@actions/core', () => ({
    getInput: mockGetInput,
    info: mockInfo,
    debug: mockDebug
}));

describe('parseInputArray', () => {
    it('parses comma-separated values', () => {
        const input = 'value1,value2, value3';
        const expected = ['value1', 'value2', 'value3'];
        expect(parseInputArray(input)).toEqual(expected);
    });

    it('handles empty values', () => {
        const input = 'value1,,value2';
        const expected = ['value1', 'value2'];
        expect(parseInputArray(input)).toEqual(expected);
    });

    it('handles whitespace', () => {
        const input = ' value1 , value2 ';
        const expected = ['value1', 'value2'];
        expect(parseInputArray(input)).toEqual(expected);
    });
});

describe('formatScore', () => {
    it('formats scores as percentages', () => {
        expect(formatScore(0)).toBe('0%');
        expect(formatScore(0.5)).toBe('50%');
        expect(formatScore(0.75)).toBe('75%');
        expect(formatScore(1)).toBe('100%');
    });

    it('rounds to nearest integer', () => {
        expect(formatScore(0.123)).toBe('12%');
        expect(formatScore(0.567)).toBe('57%');
        expect(formatScore(0.999)).toBe('100%');
    });
});

describe('formatLighthouseResults', () => {
    it('formats results correctly', () => {
        const results = [
            {
                url: 'https://example.com',
                deviceType: 'mobile',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.8 },
                    { id: 'accessibility', title: 'Accessibility', score: 0.9 }
                ]
            },
            {
                url: 'https://example.com',
                deviceType: 'desktop',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.9 },
                    { id: 'accessibility', title: 'Accessibility', score: 0.95 }
                ]
            }
        ];

        const formatted = formatLighthouseResults(results);

        expect(formatted.summary.totalUrls).toBe(1);
        expect(formatted.summary.totalTests).toBe(2);
        expect(formatted.summary.averageScores).toEqual({
            performance: 0.85,
            accessibility: 0.93
        });
    });

    it('handles multiple URLs', () => {
        const results = [
            {
                url: 'https://example.com',
                deviceType: 'mobile',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.8 }
                ]
            },
            {
                url: 'https://test.com',
                deviceType: 'mobile',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.6 }
                ]
            }
        ];

        const formatted = formatLighthouseResults(results);

        expect(formatted.summary.totalUrls).toBe(2);
        expect(formatted.summary.totalTests).toBe(2);
        expect(formatted.summary.averageScores).toEqual({
            performance: 0.7
        });
    });

    it('calculates min and max scores correctly', () => {
        const results = [
            {
                url: 'https://example.com',
                deviceType: 'mobile',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.6 },
                    { id: 'accessibility', title: 'Accessibility', score: 0.7 }
                ]
            },
            {
                url: 'https://example.com',
                deviceType: 'desktop',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.9 },
                    { id: 'accessibility', title: 'Accessibility', score: 0.8 }
                ]
            }
        ];

        const formatted = formatLighthouseResults(results);

        expect(formatted.summary.minScores).toEqual({
            performance: 0.6,
            accessibility: 0.7
        });
        expect(formatted.summary.maxScores).toEqual({
            performance: 0.9,
            accessibility: 0.8
        });
    });

    it('calculates scores by device type correctly', () => {
        const results = [
            {
                url: 'https://example.com',
                deviceType: 'mobile',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.6 }
                ]
            },
            {
                url: 'https://test.com',
                deviceType: 'mobile',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.7 }
                ]
            },
            {
                url: 'https://example.com',
                deviceType: 'desktop',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.9 }
                ]
            }
        ];

        const formatted = formatLighthouseResults(results);

        expect(formatted.summary.scoresByDevice).toEqual({
            mobile: { performance: 0.65 },
            desktop: { performance: 0.9 }
        });
    });

    it('calculates scores by URL correctly', () => {
        const results = [
            {
                url: 'https://example.com',
                deviceType: 'mobile',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.6 }
                ]
            },
            {
                url: 'https://example.com',
                deviceType: 'desktop',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.9 }
                ]
            },
            {
                url: 'https://test.com',
                deviceType: 'mobile',
                categories: [
                    { id: 'performance', title: 'Performance', score: 0.7 }
                ]
            }
        ];

        const formatted = formatLighthouseResults(results);

        expect(formatted.summary.scoresByUrl).toEqual({
            'https://example.com': { performance: 0.75 },
            'https://test.com': { performance: 0.7 }
        });
    });
});

describe('validateInputs', () => {
    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
    });

    it('validates URLs correctly', () => {
        mockGetInput.mockImplementation((name) => {
            if (name === 'urls') return 'https://example.com,https://test.com';
            if (name === 'device_types') return 'mobile,desktop';
            if (name === 'slack_webhook_url') return 'https://hooks.slack.com/services/xxx';
            return '';
        });

        expect(() => validateInputs()).not.toThrow();
        expect(mockInfo).toHaveBeenCalledWith('Input validation successful');
    });

    it('throws error for empty URLs', () => {
        mockGetInput.mockImplementation((name) => {
            if (name === 'urls') return '';
            return '';
        });

        expect(() => validateInputs()).toThrow('At least one URL must be provided');
    });

    it('throws error for invalid URLs', () => {
        mockGetInput.mockImplementation((name) => {
            if (name === 'urls') return 'https://example.com,invalid-url';
            return '';
        });

        expect(() => validateInputs()).toThrow('Invalid URL: invalid-url');
    });

    it('throws error for invalid device types', () => {
        mockGetInput.mockImplementation((name) => {
            if (name === 'urls') return 'https://example.com';
            if (name === 'device_types') return 'mobile,tablet'; // 'tablet' is invalid
            return '';
        });

        expect(() => validateInputs()).toThrow('Invalid device type: tablet. Must be \'mobile\' or \'desktop\'');
    });

    it('throws error for invalid fail_on_score_below value', () => {
        mockGetInput.mockImplementation((name) => {
            if (name === 'urls') return 'https://example.com';
            if (name === 'device_types') return 'mobile';
            if (name === 'fail_on_score_below') return '101'; // invalid value (> 100)
            if (name === 'slack_webhook_url') return 'https://hooks.slack.com/services/xxx';
            return '';
        });

        expect(() => validateInputs()).toThrow('Invalid fail_on_score_below value: 101. Must be a number between 0 and 100');
    });

    it('throws error for invalid timeout value', () => {
        mockGetInput.mockImplementation((name) => {
            if (name === 'urls') return 'https://example.com';
            if (name === 'device_types') return 'mobile';
            if (name === 'timeout') return '-10'; // invalid negative value
            if (name === 'slack_webhook_url') return 'https://hooks.slack.com/services/xxx';
            return '';
        });

        expect(() => validateInputs()).toThrow('Invalid timeout value: -10. Must be a positive number');
    });

    it('throws error when neither slack_webhook_url nor slack_token is provided', () => {
        mockGetInput.mockImplementation((name) => {
            if (name === 'urls') return 'https://example.com';
            if (name === 'device_types') return 'mobile';
            // Both slack_webhook_url and slack_token are empty
            return '';
        });

        expect(() => validateInputs()).toThrow('Either slack_webhook_url or slack_token must be provided');
    });

    it('accepts valid configuration with webhook URL', () => {
        mockGetInput.mockImplementation((name) => {
            if (name === 'urls') return 'https://example.com';
            if (name === 'device_types') return 'mobile';
            if (name === 'fail_on_score_below') return '70';
            if (name === 'timeout') return '30';
            if (name === 'slack_webhook_url') return 'https://hooks.slack.com/services/xxx';
            return '';
        });

        expect(() => validateInputs()).not.toThrow();
    });

    it('accepts valid configuration with slack token', () => {
        mockGetInput.mockImplementation((name) => {
            if (name === 'urls') return 'https://example.com';
            if (name === 'device_types') return 'mobile';
            if (name === 'fail_on_score_below') return '70';
            if (name === 'timeout') return '30';
            if (name === 'slack_token') return 'xoxb-123456789';
            return '';
        });

        expect(() => validateInputs()).not.toThrow();
    });
});
