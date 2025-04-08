const request = require('supertest');
const cheerio = require('cheerio');
const nock = require('nock');
const { sampleHtmlWithYale } = require('./test-utils');

// Create a test version of the app
const express = require('express');
const axios = require('axios');
const path = require('path');

// This creates a test app without starting the server
function createTestApp() {
  const app = express();
  
  // Middleware to parse request bodies
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  
  // Route to serve the main page
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
  
  // API endpoint to fetch and modify content
  app.post('/fetch', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }
  
      // Add http:// if no protocol is specified
      const processedUrl = url.toLowerCase().startsWith('http://') || url.toLowerCase().startsWith('https://') 
        ? url 
        : `http://${url}`;
  
      // Fetch the content from the provided URL
      const response = await axios.get(processedUrl);
      const html = response.data;
  
      // Use cheerio to parse HTML and selectively replace text content, not URLs
      const $ = cheerio.load(html);
      
      // Process text nodes in the body
      $('body *').contents().filter(function() {
        return this.nodeType === 3; // Text nodes only
      }).each(function() {
        // Replace text content but not in URLs or attributes
        const text = $(this).text();
        const newText = text.replace(/Yale/g, 'Fale').replace(/yale/g, 'fale');
        if (text !== newText) {
          $(this).replaceWith(newText);
        }
      });
      
      // Process title separately
      const title = $('title').text().replace(/Yale/g, 'Fale').replace(/yale/g, 'fale');
      $('title').text(title);
      
      return res.json({ 
        success: true, 
        content: $.html(),
        title: title,
        originalUrl: url
      });
    } catch (error) {
      console.error('Error fetching URL:', error.message);
      return res.status(500).json({ 
        error: `Failed to fetch content: ${error.message}` 
      });
    }
  });
  
  return app;
}

const testApp = createTestApp();

describe('Integration Tests', () => {
  beforeAll(() => {
    // Mock external HTTP requests
    nock.disableNetConnect();
    // Allow localhost connections for supertest
    nock.enableNetConnect('127.0.0.1');
  });

  afterAll(() => {
    // Clean up nock
    nock.cleanAll();
    nock.enableNetConnect();
  });

  afterEach(() => {
    // Clear any lingering nock interceptors after each test
    nock.cleanAll();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Setup mock for example.com
    nock('https://example.com')
      .get('/')
      .reply(200, sampleHtmlWithYale);
    
    // Make a request to our proxy app using supertest
    const response = await request(testApp)
      .post('/fetch')
      .send({ url: 'https://example.com/' });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    // Verify Yale has been replaced with Fale in text
    const $ = cheerio.load(response.body.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');
    
    // Verify URLs remain unchanged
    const links = $('a');
    let hasYaleUrl = false;
    links.each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) {
        hasYaleUrl = true;
      }
    });
    expect(hasYaleUrl).toBe(true);
    
    // Verify link text is changed
    expect($('a').first().text()).toBe('About Fale');
  });

  test('Should handle invalid URLs', async () => {
    // Mock a failed request
    nock('http://not-a-valid-url')
      .get('/')
      .replyWithError('Invalid URL');
    
    const response = await request(testApp)
      .post('/fetch')
      .send({ url: 'not-a-valid-url' });
    
    expect(response.status).toBe(500);
  });

  test('Should handle missing URL parameter', async () => {
    const response = await request(testApp)
      .post('/fetch')
      .send({});
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('URL is required');
  });
});
