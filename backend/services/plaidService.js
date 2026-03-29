const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'gcgl-default-encryption-key-change-me';

// Plaid client setup
const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENVIRONMENT || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID || '',
      'PLAID-SECRET': process.env.PLAID_SECRET || '',
    },
  },
});

const plaidClient = new PlaidApi(config);

// Encrypt/decrypt access tokens
function encrypt(text) {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

function decrypt(cipherText) {
  const bytes = CryptoJS.AES.decrypt(cipherText, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// Create link token for Plaid Link
async function createLinkToken(userId) {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: String(userId) },
    client_name: 'GCGL Admin',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  });
  return response.data.link_token;
}

// Exchange public token for access token
async function exchangeToken(publicToken) {
  const response = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });
  return response.data.access_token;
}

// Get accounts for an access token
async function getAccounts(accessToken) {
  const response = await plaidClient.accountsGet({
    access_token: accessToken,
  });
  return response.data.accounts;
}

// Get transactions for a date range
async function getTransactions(accessToken, startDate, endDate, accountIds = null) {
  const request = {
    access_token: accessToken,
    start_date: startDate,
    end_date: endDate,
  };
  if (accountIds) request.options = { account_ids: accountIds };

  let allTransactions = [];
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    request.options = { ...(request.options || {}), count: 100, offset };
    const response = await plaidClient.transactionsGet(request);
    allTransactions = allTransactions.concat(response.data.transactions);
    hasMore = allTransactions.length < response.data.total_transactions;
    offset = allTransactions.length;
  }

  return allTransactions;
}

module.exports = {
  plaidClient,
  encrypt,
  decrypt,
  createLinkToken,
  exchangeToken,
  getAccounts,
  getTransactions,
};
