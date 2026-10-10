// Helper Function: Generates a unique string for the current week (Resets on Monday)
const getCurrentWeekIdentifier = () => {
    const d = new Date();
    // Shift date to Thursday to calculate ISO week properly
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); 
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
};


module.exports = {getCurrentWeekIdentifier};