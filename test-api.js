// Simple test script to check if the API is working
const fetch = require('node-fetch');

const API_URL = process.env.API_URL || 'http://localhost:10000';
const TEST_URL = 'https://www.airbnb.com.br/rooms/648715554288964650';

async function testApi() {
    try {
        console.log(`Testing API at ${API_URL}...`);

        // First check if the API is online
        const healthCheck = await fetch(API_URL);
        const healthStatus = await healthCheck.json();
        console.log('Health check response:', JSON.stringify(healthStatus, null, 2));

        // Now test the scraping endpoint
        console.log(`\nTesting scraping with URL: ${TEST_URL}`);
        const response = await fetch(`${API_URL}/scrape-airbnb`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: TEST_URL,
                step: 1
            }),
        });

        const data = await response.json();
        console.log('Scraping response:', JSON.stringify(data, null, 2));

        if (data.status === 'error') {
            console.error('Scraping failed with error:', data.error);
        } else {
            console.log('Scraping successful!');
        }
    } catch (error) {
        console.error('Error testing API:', error);
    }
}

testApi(); 