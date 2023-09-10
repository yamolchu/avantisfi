const { random } = require('user-agents');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const { RecaptchaV2Task } = require('node-capmonster');
const { Worker, workerData, isMainThread } = require('worker_threads');

const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const config = require('../inputs/config.ts');
const csvWriter = createCsvWriter({
  path: './result.csv',
  header: [
    { id: 'email', title: 'Email' },
    { id: 'proxy', title: 'Proxy' },
  ],
  append: true,
});

function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}
const numThreads = config.numThreads;
const customDelay = config.customDelay;

function parseEmails(filePath: string) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const emails: { email: string; imapPass: string }[] = [];

  lines.forEach((line: string) => {
    const [email = '', imapPass = ''] = line.split(':');
    emails.push({ email: email.trim(), imapPass: imapPass.trim() });
  });

  return emails;
}
function parseProxies(filePath: string) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const proxies: string[] = [];

  lines.forEach((line: string) => {
    const proxy = line.trim();
    proxies.push(proxy);
  });

  return proxies;
}
const emails = parseEmails('./inputs/emails.txt');
const proxies = parseProxies('./inputs/proxies.txt');

async function reg(email: any, proxy: string) {
  const client = new RecaptchaV2Task(config.captchaAPIKey);
  const task = client.task({
    websiteURL: 'https://www.avantisfi.com/',
    websiteKey: '6Lfc1YInAAAAAJ12rskf4nSPg_Cfbf5FLrynn5wY',
  });

  const taskId = await client.createWithTask(task);
  const result = await client.joinTaskResult(taskId);
  const token = result.gRecaptchaResponse;

  const headers = {
    'user-agent': random().toString(),
    authority: 'backend.prod.haqqex.tech',
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9,uk;q=0.8',
    'content-type': 'application/json',
    origin: 'https://haqqex.com',
    referer: 'https://haqqex.com/',
    'sec-ch-ua': '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
  };
  const session = axios.create({
    headers: headers,
    httpsAgent:
      config.proxyType === 'http' ? new HttpsProxyAgent(`http://${proxy}`) : new SocksProxyAgent(`socks5://${proxy}`),
  });
  const data = { email: email.email, 'g-recaptcha-response': token, referLink: config.ref };
  const res = await session.post('https://api.avantisfi.com/v1/user/signup', data);
  console.log(res.data);
  const resultData = [
    {
      email: email.email,
      proxy: proxy,
    },
  ];
  await csvWriter
    .writeRecords(resultData)
    .then(() => {
      console.log('CSV file has been saved.');
    })
    .catch((error: any) => {
      console.error(error);
    });
}

function regRecursive(emails: any, proxies: any, index = 0, numThreads = 4) {
  if (index >= emails.length) {
    return;
  }

  const worker = new Worker(__filename, {
    workerData: { email: emails[index], proxy: proxies[index] },
  });
  worker.on('message', (message: any) => {
    console.log(message);
  });
  worker.on('error', (error: any) => {
    console.error(error);
  });
  worker.on('exit', (code: any) => {
    if (code !== 0) {
      console.error(`Thread Exit ${code}`);
    }
    regRecursive(emails, proxies, index + numThreads, numThreads);
  });
}
const main = async () => {
  if (isMainThread) {
    for (let i = 0; i < numThreads; i++) {
      await delay(customDelay);
      regRecursive(emails, proxies, i, numThreads);
    }
  } else {
    await delay(customDelay);
    const { email, proxy } = workerData;
    reg(email, proxy);
  }
};
main();
