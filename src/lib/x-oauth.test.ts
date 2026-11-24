/**
 * Official X / RFC 5849 OAuth 1.0a HMAC-SHA1 test vectors.
 * Credentials below are the published, invalidated examples from
 * https://docs.x.com/fundamentals/authentication/oauth-1-0a/creating-a-signature
 * — they are not live secrets and must never be used against api.x.com.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { percentEncode, signOAuth1 } from './x-oauth.ts';

test('percent-encodes per RFC 5849 / X docs (including ! \' ( ) *)', () => {
  assert.equal(percentEncode('Ladies + Gentlemen'), 'Ladies%20%2B%20Gentlemen');
  assert.equal(percentEncode('An encoded string!'), 'An%20encoded%20string%21');
  assert.equal(percentEncode('Dogs, Cats & Mice'), 'Dogs%2C%20Cats%20%26%20Mice');
  assert.equal(percentEncode('☃'), '%E2%98%83');
  assert.equal(percentEncode("!'()*"), '%21%27%28%29%2A');
  assert.equal(percentEncode('~-_.'), '~-_.');
});

test('matches the official X OAuth 1.0a HMAC-SHA1 signature test vector', async () => {
  const result = await signOAuth1({
    method: 'POST',
    url: 'https://api.x.com/1.1/statuses/update.json?include_entities=true',
    credentials: {
      consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
      consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
      token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
      tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
    },
    formParams: {
      status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
    },
    nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
    timestamp: '1318622958',
  });

  const expectedBase =
    'POST&https%3A%2F%2Fapi.x.com%2F1.1%2Fstatuses%2Fupdate.json&include_entities%3Dtrue%26oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog%26oauth_nonce%3DkYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1318622958%26oauth_token%3D370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb%26oauth_version%3D1.0%26status%3DHello%2520Ladies%2520%252B%2520Gentlemen%252C%2520a%2520signed%2520OAuth%2520request%2521';

  assert.equal(result.signatureBaseString, expectedBase);
  assert.equal(result.signature, 'Ls93hJiZbQ3akF3HF3x1Bz8/zU4=');
  assert.match(
    result.authorization,
    /oauth_signature="Ls93hJiZbQ3akF3HF3x1Bz8%2FzU4%3D"/
  );
});

test('does not include JSON or multipart bodies in the signature base string', async () => {
  const result = await signOAuth1({
    method: 'POST',
    url: 'https://api.x.com/2/tweets',
    credentials: {
      consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
      consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
      token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
      tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
    },
    nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
    timestamp: '1318622958',
  });

  assert.equal(result.parameterString.includes('tweet_image'), false);
  assert.equal(result.parameterString.includes('media'), false);
  assert.equal(result.parameterString.includes('text='), false);
  assert.match(result.parameterString, /^oauth_consumer_key=/);
  assert.equal(result.parameterString.includes('&text='), false);
});
