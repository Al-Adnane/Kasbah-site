# Weekly Summary Notification — MANDATORY for retention

Without this, users will uninstall because they think Kasbah isn't doing anything.

## Example

```
Kasbah Weekly Summary
- 63 AI actions protected
- 4 leaks prevented
- 0 interruptions
```

## Creates
- Gratitude
- Trust
- Willingness to pay

## Implementation Notes

### Extension (background.js)
```javascript
chrome.alarms.create("weeklySummary", { periodInMinutes: 10080 }); // 7 days

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "weeklySummary") {
        const stats = await chrome.storage.local.get([
            'weeklyBlocks', 'weeklyWarnings', 'weeklySilent'
        ]);

        if (stats.weeklySilent > 0 || stats.weeklyBlocks > 0) {
            chrome.notifications.create({
                type: "basic",
                title: "Kasbah Weekly Summary",
                message: `${stats.weeklySilent + stats.weeklyWarnings} AI actions protected. ${stats.weeklyBlocks} leaks prevented.`,
                iconUrl: "icons/shield-48.png"
            });
        }

        // Reset
        await chrome.storage.local.set({
            weeklyBlocks: 0, weeklyWarnings: 0, weeklySilent: 0
        });
    }
});
```

### Desktop App (guard.rs)
- Track weekly stats in State struct
- Fire macOS notification at end of week
- Also show in dashboard on next open

### Daily Digest Variant
- Same concept but daily (8 PM local time)
- Lighter: "Today: X protected, Y prevented"
