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
            // headless: false,
            executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', ///TODO: change hardcoded path
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

        await grepolis.page.on('request', async request => {
            if(request.url().includes('alliance_forum')) {
                console.log('Saving the url of alliance_forum request');
                grepolis.fetchLink = request._url;
            }
            request.continue();
        });

        await grepolis.page.evaluate(() => {document.querySelector('.button > div[data-subtype="allianceforum"]').click()});

        const cookies = await grepolis.page.cookies();
        const sidCookie = cookies.find((element) => {
            return element['name'] === 'sid';
        });
        console.log('Saving the sid cookie');
        grepolis.sid = sidCookie['value'];

        /* Fetching bookmarks */
        await grepolis.page.waitFor('.submenu_link');
        const bookmarkNames = await grepolis.page.$$('.submenu_link');
        const forumData = [];
        for(let i=bookmarkNames.length-1; i>=0; i--) {
            const forumId = bookmarkNames[i]._remoteObject.description.match(/\d+/)[0];
            const name = await grepolis.page.evaluate(element => element.textContent, bookmarkNames[i]);
            forumData.push({
                forumId,
                name,
            })
        }

        await grepolis.parseBookmarks(forumData);

        grepolis.browser.close();
    },

    fetch: async data => {
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

    parseBookmarks: async (data) => {
        const bookmarks = [];
        for(let bookmark of data) {
            bookmarks.push(
                bookmark,
            )
        }

        database.bookmarks = bookmarks;
    },

    parseForumThreads: async () => {
        console.log('Parsing... ');
        for(let bookmark of database.bookmarks) {
            let threadPage = 1;
            let threadPagesCount = null;
            const bookmarkTitle = bookmark['name'];
            const bookmarkId = bookmark['forumId'];
            const threads = [];
            do {
                await grepolis.fetch({ forum_id: bookmark['forumId'], page: threadPage });
                const $ = cheerio.load(grepolis.html, { normalizeWhitespace: true });
                threadPagesCount = $('.forum_pager > .paginator_bg').length;
                const postsArray = await $('.title_author_wrapper > .title > a').toArray();

                for(let element of postsArray) {
                    const threadTitle = $(element).text();
                    const thread_id = $(element).attr('onclick').match('[0-9]+')[0];
                    const posts = await grepolis.parseForumPosts(thread_id);
                    threads.push({
                        threadId: thread_id,
                        threadTitle,
                        posts,
                        threadPage,
                    })
                }
                threadPage++;
            } while(threadPage <= threadPagesCount);

            database.bookmarkThreads.push({
                bookmarkId,
                bookmarkTitle,
                threads
            });
        }
    },

    parseForumPosts: async thread_id => {
        ///TODO: Handle published reports?
        let postPage = 1;
        let postPagesCount = null;
        const posts = [];
        do {
            await grepolis.fetch({ thread_id, page: postPage });
            const $ = cheerio.load(grepolis.html, { normalizeWhitespace: true });
            postPagesCount = $('.forum_pager > .paginator_bg').length;
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
                    lastEdited,
                    postPage,
                });
            });
            postPage++;
        } while(postPage <= postPagesCount);

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
    await grepolis.parseForumThreads();
    await grepolis.saveToFile('./output.json');
})();

