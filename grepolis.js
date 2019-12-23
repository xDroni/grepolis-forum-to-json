const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const fs = require('fs');
const prompt = require('prompt-sync')();

const { getArgument } = require('./utils');

const BASE_URL = 'https://pl.grepolis.com/';

const database = {
    bookmarks: null,
    bookmarkThreads: [],
    posts: null,
};

const grepolis = {
    browser: null,
    page: null,
    html: null,
    fetchLink: null,
    sid: null,

    initialize: async () => {
        grepolis.browser = await puppeteer.launch({
            headless: true,
            executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        });

        grepolis.page = await grepolis.browser.newPage();
    },

    login: async (login, password, worldNumber) => {
        await grepolis.page.goto(BASE_URL, { waitUntil: 'networkidle2' });

        /* Logging in */
        await grepolis.page.waitFor('input[id="login_userid"]');
        await grepolis.page.type('input[id="login_userid"]', login, { delay: 50 });
        await grepolis.page.type('input[id="login_password"]', password, { delay: 50 });
        await grepolis.page.keyboard.press('Enter');
        console.log('Logging in...');

        /* Selecting the world */
        await grepolis.page.waitFor('a[class="logout_button"]');
        const worlds = await grepolis.page.$$('div[id="worlds"] > div > ul > li');
        for(let i=0; i<worlds.length-1; i++) {
            const text = await grepolis.page.evaluate(element => element.textContent, worlds[i]);
            console.log(i + 1, text);
        }

        let choice = worldNumber;
        while(!(choice >= 1 && choice <= worlds.length-1)) {
            choice = prompt(`Choose the world [1-${worlds.length-1}]: `);
        }
        console.log('Your choice: ' + choice);

        /* Logging in into world */
        await worlds[choice-1].click();
        console.log('Loading the world...');

        await grepolis.page.waitFor(5000);

        /* Alliance forum click - intercept the request */
        await grepolis.page.waitFor('.button > div[data-subtype="allianceforum"]');
        await grepolis.page.setRequestInterception(true);

        grepolis.page.on('request', request => {
            if(request.url().includes('alliance_forum')) {
                console.log('Saving the url of alliance forum request');
                grepolis.fetchLink = request._url;
            }
            request.abort();
        });

        await grepolis.page.evaluate(() => {document.querySelector('.button > div[data-subtype="allianceforum"]').click()});
        console.log('Opening the alliance forum');

        const cookies = await grepolis.page.cookies();
        const sidCookie = cookies.find((element) => {
            return element['name'] === 'sid';
        });
        console.log('Saving the sid cookie');
        grepolis.sid = sidCookie['value'];

        grepolis.browser.close();
    },

    fetch: async (data) => {
        const res = await fetch(grepolis.fetchLink, {
            "headers": {
                "cookie": `sid=${grepolis.sid}`,
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "x-requested-with": "XMLHttpRequest"
            },
            "body": `json=${JSON.stringify(data)}`,
            "method": "POST",
        });
        const json = await res.json();
        try {
            grepolis.html = json.plain.html;
        } catch {
            console.error(json);
            process.exit(1);
        }
    },

    saveToFile: (filename) => {
        fs.writeFileSync(filename, JSON.stringify(database.bookmarkThreads, null, 2));
        console.log('Saved output to file:', filename);
    },

    parseBookmarks: async () => {
        const $ = cheerio.load(grepolis.html, { normalizeWhitespace: true });
        const bookmarks = [];
        await $('select[name="forum[forum_id]"] > option').each((index, element) => {
            const forumId = $(element).attr('value');
            const name = $(element).text();
            bookmarks.push({
                forumId,
                name,
            })
        });
        database.bookmarks = bookmarks;
    },

    parseForumThreads: async () => {
        console.log('Parsing... ');
        for(let bookmark of database.bookmarks) {
            let page = 1;
            let threadPages = null;
            const bookmarkTitle = bookmark['name'];
            const bookmarkId = bookmark['forumId'];
            const threads = [];
            do {
                await grepolis.fetch({ forum_id: bookmark['forumId'], page: page });
                const $ = cheerio.load(grepolis.html, { normalizeWhitespace: true });
                threadPages = $('.forum_pager > .paginator_bg').length;
                const postsArray = await $('.title_author_wrapper > .title > a').toArray();

                for(let element of postsArray) {
                    const threadTitle = $(element).text();
                    const threadId = $(element).attr('onclick').match('[0-9]+')[0];
                    await grepolis.fetch({thread_id: threadId});
                    const posts = await grepolis.parseForumPosts();
                    threads.push({
                        threadId,
                        threadTitle,
                        posts,
                        page,
                    })
                }
                page++;
            } while(page === threadPages);

            database.bookmarkThreads.push({
                bookmarkId,
                bookmarkTitle,
                threads
            });
        }
    },

    parseForumPosts: async () => {
        ///TODO: Handle pages of posts
        ///TODO: Handle published reports?
        const $ = cheerio.load(grepolis.html, { normalizeWhitespace: true });
        const posts = [];
        await $('#forum > ul > li').each((index, element) => {
            const postText = $(element).find('.post > .content > p').text().trim();
            const date = $(element).find('.post > .author').text().trim().match('[0-9]+\\.[0-9]+\\.[0-9]+\\ [0-9]+:[0-9]+')[0];
            const author = $(element).find('.post > .author > a').attr('onclick').match('\'(.+)\'')[1];
            let lastEdited = $(element).find('.post > .post_functions').text().trim().match('[0-9]+\\.[0-9]+\\.[0-9]+\\ [0-9]+:[0-9]+');
            if(lastEdited !== null) lastEdited = lastEdited[0];
            posts.push({
                author,
                postText,
                date,
                lastEdited
            });
        });
        return posts;
    }
};

(async () => {
    await grepolis.initialize();
    await grepolis.login(
        getArgument('login'),
        getArgument('password'),
        getArgument('world'),
    );
    await grepolis.fetch({}).catch(err => { console.error(err); process.exit(1)});
    await grepolis.parseBookmarks();
    await grepolis.parseForumThreads();
    await grepolis.saveToFile('./output.json');
})();

