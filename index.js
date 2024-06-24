const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');
const FormData = require('form-data');
const fs = require('fs');
const oauth = require('oauth');

const app = express();

const port = 3000;

const API_KEY = '';
const API_KEY_SECRET = '';

const ACCESS_TOKEN = '';
const ACCESS_TOKEN_SECRET = ''

const CLIENT_ID = '';
const CLIENT_SECRET = '';

const redirect_uri = 'http://127.0.0.1:3000/callback';
const scope = 'tweet.read tweet.write users.read offline.access';
const state = 'some_state';

const code_verifier = crypto.randomBytes(32).toString('hex');
const code_challenge = crypto.createHash('sha256').update(code_verifier).digest('base64url');

app.get('/authorize', (req, res) => {
  const authorizationUrl = `https://twitter.com/i/oauth2/authorize?${querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method: 'S256',
  })}`;

  console.log(authorizationUrl);
  res.redirect(authorizationUrl);
});

app.get('/callback', async (req, res) => {
  const { code, state: returnedState } = req.query;

  if (state !== returnedState) {
    return res.status(400).send('State mismatch');
  }

  try {
    const tokenResponse = await axios.post('https://api.twitter.com/2/oauth2/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri,
      grant_type: 'authorization_code',
      code,
      code_verifier,
    }, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token } = tokenResponse.data;

    app.locals.access_token = access_token;
    fs.writeFileSync('creds.json', JSON.stringify(tokenResponse.data, null, 2));
    res.send('Authorization successful! You can now make tweets using your access token.');
  } catch (error) {
    res.status(500).send('Error exchanging authorization code for access token.');
    console.error(error);
  }
});

app.post('/upload_media', async (req, res) => {
  const OAuth = new oauth.OAuth(
    'https://api.twitter.com/oauth/request_token',
    'https://api.twitter.com/oauth/access_token',
    API_KEY,
    API_KEY_SECRET,
    '1.0A',
    null,
    'HMAC-SHA1',
  );

  const authHeader = OAuth.authHeader('https://upload.twitter.com/1.1/media/upload.json', ACCESS_TOKEN, ACCESS_TOKEN_SECRET, 'POST');

  try {
    const filePath = './media.jpeg'; // Path to the image you want to upload
    const mediaData = fs.readFileSync(filePath);

    // Initialize media upload
    const form = new FormData();
    form.append('media', mediaData, {
      filename: 'media.jpeg',
      contentType: 'image/jpeg',
    });

    const mediaUploadResponse = await axios.post('https://upload.twitter.com/1.1/media/upload.json', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': authHeader,
      },
    });

    const media_id = mediaUploadResponse.data.media_id_string;

    app.locals.media_id = media_id;

    res.send(`Media upload successful! Media ID: ${media_id}`);
  } catch (error) {
    res.status(500).send('Error uploading media.');
    console.error(error);
  }
});

// Step 3: Endpoint to make a tweet
app.post('/tweet', async (req, res) => {
  const access_token = app.locals.access_token;
  const media_id = app.locals.media_id;

  if (!access_token) {
    return res.status(400).send('Access token is not available.');
  }

  try {
    const tweetResponse = await axios.post('https://api.twitter.com/2/tweets', {
      text: `Hello, Twitter! It is ${new Date().toISOString()}.`,
      // media is only works if tweeting for Developers account
      media: {
        media_ids: [media_id],
      }
    }, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    });

    res.send(`Tweet successful! Tweet ID: ${tweetResponse.data.data.id}`);
  } catch (error) {
    res.status(500).send('Error making tweet.');
    console.error(error);
    fs.writeFileSync('error.json', JSON.stringify(error.response.data, null, 2));
  }
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
