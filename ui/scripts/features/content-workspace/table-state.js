const blogPageState = {
  topics: { limit: 50, offset: 0, total: 0 },
  shopping: { limit: 50, offset: 0, total: 0 }
};
const tableSortState = {
  trendPosting: { key: 'latestTrendDate', direction: 'desc' },
  topics: { key: 'rowNumber', direction: 'desc' },
  shopping: { key: 'rowNumber', direction: 'desc' }
};
