// Provider abstraction layer.
// All external integrations go through these interfaces so that
// specific APIs can be plugged in later via environment variables
// without changing application logic.

const SearchProvider = require('./searchProvider');
const AIProvider = require('./aiProvider');
const WebsiteAnalyzer = require('./websiteAnalyzer');
const ContactFinder = require('./contactFinder');
const MessageProvider = require('./messageProvider');
const QueryGenerator = require('./queryGenerator');

module.exports = {
  SearchProvider,
  AIProvider,
  WebsiteAnalyzer,
  ContactFinder,
  MessageProvider,
  QueryGenerator
};
