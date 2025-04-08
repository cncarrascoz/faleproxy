const request = require('supertest');
const express = require('express');
const path = require('path');
const nock = require('nock');
const fs = require('fs');
const { sampleHtmlWithYale } = require('./test-utils');

// Import the actual app.js module
const app = require('../app');

describe('Main Application Tests', () => {
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
    // Close the server
    if (app.server && app.server.close) {
      app.server.close();
    }
  });

  afterEach(() => {
    // Clear any lingering nock interceptors after each test
    nock.cleanAll();
  });

  test('GET / should serve the index.html file', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.text).toContain('Faleproxy');
  });

  test('POST /fetch should replace Yale with Fale in content', async () => {
    // Setup mock for example.com
    nock('https://example.com')
      .get('/')
      .reply(200, sampleHtmlWithYale);
    
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'https://example.com/' });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.content).toContain('Fale University');
    expect(response.body.content).not.toContain('>Yale University<');
    expect(response.body.title).toBe('Fale University Test Page');
  });

  test('POST /fetch should handle URLs without protocol', async () => {
    // Setup mock for example.com
    nock('http://example.com')
      .get('/')
      .reply(200, sampleHtmlWithYale);
    
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'example.com' });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.originalUrl).toBe('example.com');
  });

  test('POST /fetch should return 400 for missing URL', async () => {
    const response = await request(app)
      .post('/fetch')
      .send({});
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('URL is required');
  });

  test('POST /fetch should return 500 for failed requests', async () => {
    // Setup mock for a failed request
    nock('http://error.example.com')
      .get('/')
      .replyWithError('Connection failed');
    
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'http://error.example.com' });
    
    expect(response.status).toBe(500);
    expect(response.body.error).toContain('Failed to fetch content');
  });

  test('POST /fetch should preserve URLs containing Yale', async () => {
    const htmlWithYaleUrls = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Yale Links Test</title>
      </head>
      <body>
        <a href="https://www.yale.edu">Yale Website</a>
        <img src="https://www.yale.edu/logo.png" alt="Yale Logo">
      </body>
      </html>
    `;
    
    nock('http://links.example.com')
      .get('/')
      .reply(200, htmlWithYaleUrls);
    
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'http://links.example.com' });
    
    expect(response.status).toBe(200);
    expect(response.body.content).toContain('href="https://www.yale.edu"');
    expect(response.body.content).toContain('src="https://www.yale.edu/logo.png"');
    expect(response.body.content).toContain('Fale Website');
  });

  test('POST /fetch should handle HTML with no Yale references', async () => {
    const htmlWithoutYale = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Page</title>
      </head>
      <body>
        <h1>Hello World</h1>
        <p>This is a test page with no Yale references.</p>
      </body>
      </html>
    `;
    
    nock('http://no-yale.example.com')
      .get('/')
      .reply(200, htmlWithoutYale);
    
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'http://no-yale.example.com' });
    
    expect(response.status).toBe(200);
    expect(response.body.content).toContain('no Fale references');
  });
});
