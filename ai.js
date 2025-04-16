// ai.js
const axios = require('axios');
require('dotenv').config();

async function askGPT(prompt) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error communicating with OpenAI:', error);
    return 'Sorry, I couldn’t process your request right now.';
  }
}

module.exports = askGPT;
