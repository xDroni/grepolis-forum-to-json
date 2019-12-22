const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const fs = require('fs');
const prompt = require('prompt-sync')();

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
    fetchLink: "https://pl84.grepolis.com/game/alliance_forum?town_id=16422&action=forum&h=2f71ab6273b617319a63c213ad5b781a8de1bbfb",
    sid: null,

    initialize: async () => {
        grepolis.browser = await puppeteer.launch({
            headless: false,
            executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        });

        grepolis.page = await grepolis.browser.newPage();
    },

    login: async (login, password) => {
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

        let choice = -1;
        while(!(choice >= 1 && choice <= worlds.length-1)) {
            choice = prompt(`Choose the world [1-${worlds.length-1}]: `);
        }
        console.log('Your choice: ' + choice);

        /* Logging in into world */
        await worlds[choice-1].click();
        console.log('Loading the world...');

        await grepolis.page.waitFor(5000);

        await grepolis.page.waitFor('.button > div[data-subtype="allianceforum"]');
        await grepolis.page.evaluate(() => {document.querySelector('.button > div[data-subtype="allianceforum"]').click()});
        console.log('Opening the alliance forum');

        const cookies = await grepolis.page.cookies();
        const sidCookie = cookies.find((element) => {
            return element['name'] === 'sid';
        });
        grepolis.sid = sidCookie['value'];
        console.log('grepolis.sid', grepolis.sid);
    },

    fetch: async (data) => {
        const res = await fetch(grepolis.fetchLink, {
            "headers": {
                "cookie": "sid=sogcc8gck8k048cgs4cc84s0wg8gwwgkkkg0ccwg0kww00owkoc0g08kgsks0sg4",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "x-requested-with": "XMLHttpRequest"
            },
            "body": "json="+JSON.stringify(data),
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
        fs.writeFileSync(filename, grepolis.html, (err) => {
            if(err) console.log(err);
            else console.log('file saved');
        })
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
        for(let bookmark of database.bookmarks) {
            await grepolis.fetch({forum_id: bookmark['forumId']});
            const $ = cheerio.load(grepolis.html, { normalizeWhitespace: true });
            const bookmarkTitle = bookmark['name'];
            const bookmarkId = bookmark['forumId'];
            const threads = [];
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
                })
            }
            database.bookmarkThreads.push({ bookmarkId, bookmarkTitle, threads });
        }
    },

    parseForumPosts: async () => {
        const $ = cheerio.load(grepolis.html, { normalizeWhitespace: true });
        const posts = [];
        await $('.content > p').each((index, element) => {
            const postText = $(element).text().trim();
            const date = $('.author').text().trim().match('[0-9]+\\.[0-9]+\\.[0-9]+\\ [0-9]+:[0-9]+')[0];
            const author = $('.author > a').attr('onclick').match('\'(.+)\'')[1];
            let lastEdited = $('.post_functions').text().trim().match('[0-9]+\\.[0-9]+\\.[0-9]+\\ [0-9]+:[0-9]+');
            if(lastEdited !== null) lastEdited = lastEdited[0];
            posts.push({date, lastEdited, author, postText});
        });
        return posts;
    }
};

(async () => {
    await grepolis.initialize();
    await grepolis.login('', '');
    // await grepolis.fetch({forum_id: 1687}).catch(err => { console.error(err); process.exit(1)});
    // await grepolis.parseBookmarks();
    // console.log(database.bookmarks);
    // await grepolis.parseForumThreads();
    // console.log(JSON.stringify(database.bookmarkThreads, null, 2));
})();

