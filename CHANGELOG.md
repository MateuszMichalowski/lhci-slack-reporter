# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2025-01-27

### 🚀 Major Performance Accuracy Update

This release significantly improves the accuracy of Lighthouse performance scores in CI environments to better match browser-based testing.

### Changed (Breaking)
- **Default CPU throttling for mobile reduced from 4x to 2x** - More accurately reflects real-world mobile performance and CI capabilities
- **Default throttling method changed from `simulate` to `devtools`** - Provides more accurate and consistent results
- **Enhanced Chrome flags applied by default** - Includes performance-critical flags for consistent rendering and timing
- **Mobile viewport updated to 412x823 @ 1.75x DPR** - Better matches modern mobile devices (Pixel 5)

### Added
- **Warmup runs** (`warmup_runs`) - Automatically performs warmup runs to stabilize performance metrics (default: 1)
- **Performance presets** (`performance_preset`) - Choose between `browser-match` (default), `ci-optimized`, or `legacy`
- **Chrome launch timeout** (`chrome_launch_timeout`) - Configurable timeout for Chrome browser launch (default: 30000ms)
- **Performance metrics monitoring** - Reports test execution time, score variance, and other helpful metrics
- **Enhanced Chrome flags**:
  - `--disable-background-timer-throttling` - Prevents timing issues in headless mode
  - `--disable-renderer-backgrounding` - Ensures consistent rendering
  - `--disable-backgrounding-occluded-windows` - Prevents window occlusion issues
  - `--force-color-profile=srgb` - Ensures consistent color rendering
  - `--enable-features=NetworkService,NetworkServiceInProcess` - Network optimizations
  - `--disable-features=TranslateUI` - Reduces overhead
  - `--metrics-recording-only` - Performance optimization
  - `--enable-automation` - Stability improvement
  - `--password-store=basic` - Prevents keychain access
  - `--use-mock-keychain` - Prevents system keychain prompts

### Improved
- **Unified throttling method** - Desktop and mobile now use the same throttling approach for consistency
- **Better screen emulation** - More accurate viewport and DPR settings for mobile devices
- **Performance monitoring** - Detailed metrics help understand score variations
- **Lighthouse command optimizations** - Added `--disable-storage-reset`, `--disable-full-page-screenshot`, and `--gather-mode=navigation`

### Migration Guide

#### Score Changes to Expect
Users will likely see different (more accurate) performance scores:
- Mobile scores may increase by 10-30% due to reduced CPU throttling (4x → 2x)
- Desktop scores should remain relatively stable
- Overall scores should now match Chrome DevTools Lighthouse within 5-10%

#### If You Need Previous Behavior
To maintain backward compatibility, use these settings:
```yaml
performance_preset: 'legacy'
throttling_method: 'simulate'
cpu_slowdown_multiplier: '4'  # For mobile
```

#### Adjusting Score Thresholds
Due to more accurate scoring, you may need to adjust your `fail_on_score_below` thresholds:
- Previous threshold: 50 → New threshold: 60-70
- Previous threshold: 70 → New threshold: 75-85

### Why These Changes?
1. **Headless Chrome differences** - Default Chrome flags were causing significant rendering differences
2. **Excessive CPU throttling** - 4x slowdown was too aggressive for modern CI environments
3. **Inconsistent throttling** - Different methods for mobile/desktop caused confusion
4. **Cold start penalties** - First runs were consistently slower without warmup

### Technical Details
- Scores now align with Chrome DevTools Lighthouse (within 5-10% variance)
- Warmup runs eliminate cold-start penalties in CI environments
- DevTools throttling provides more accurate network simulation
- Enhanced Chrome flags ensure consistent rendering and timing

## [1.0.7] - Previous Version
- Last version before major performance accuracy improvements