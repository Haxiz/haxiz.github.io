// Want to use or contribute to this? https://github.com/Glitchii/embedbuilder
// If you find an issue, please report it, make a P.R, or use the discussion page. Thanks

options = window.options || {};
inIframe = window.inIframe || top !== self;
currentURL = () => new URL(inIframe ? /(https?:\/\/(?:[\d\w]+\.)?[\d\w\.]+(?::\d+)?)/g.exec(document.referrer)?.[0] || location.href : location.href);

let params = currentURL().searchParams,
    hasParam = param => params.get(param) !== null,
    dataSpecified = options.dataSpecified || params.get('data'),
    username = params.get('username') || options.username,
    avatar = params.get('avatar') || options.avatar,
    guiTabs = params.get('guitabs') || options.guiTabs,
    useJsonEditor = params.get('editor') === 'json' || options.useJsonEditor,
    verified = hasParam('verified') || options.verified,
    reverseColumns = hasParam('reverse') || options.reverseColumns,
    noUser = localStorage.getItem('noUser') || hasParam('nouser') || options.noUser,
    onlyEmbed = hasParam('embed') || options.onlyEmbed,
    allowPlaceholders = hasParam('placeholders') || options.allowPlaceholders,
    autoUpdateURL = localStorage.getItem('autoUpdateURL') || options.autoUpdateURL,
    autoParams = localStorage.getItem('autoParams') || hasParam('autoparams') || options.autoParams,
    hideEditor = localStorage.getItem('hideeditor') || hasParam('hideeditor') || options.hideEditor,
    hidePreview = localStorage.getItem('hidepreview') || hasParam('hidepreview') || options.hidePreview,
    hideMenu = localStorage.getItem('hideMenu') || hasParam('hidemenu') || options.hideMenu,
    validationError, activeFields = -1, lastGuiJson, colNum = 1, num = 0;

const stringify = json => {
  return JSON.stringify(json, null, 4).replaceAll("\\n", "\n").substring(2).slice(0, -1);
}

const toggleStored = item => {
  const found = localStorage.getItem(item);
  if (!found)
    return localStorage.setItem(item, true);

  localStorage.removeItem(item);
  return found;
};

const createElement = object => {
  let element;
  for (const tag in object) {
    element = document.createElement(tag);

    for (const attr in object[tag])
      if (attr !== 'children') element[attr] = object[tag][attr];
      else for (const child of object[tag][attr])
        element.appendChild(createElement(child));

  }

  return element;
}

const jsonToBase64 = (jsonCode, withURL = false, redirect = false) => {
  let data = btoa(escape((stringify(typeof jsonCode === 'object' ? jsonCode : json))));

  if (withURL) {
    const url = currentURL();
    url.searchParams.set('data', data);
    if (redirect) window.top.location.href = url;
    // Replace %3D ('=' url encoded) with '='
    data = url.href.replace(/data=\w+(?:%3D)+/g, 'data=' + data);
  }

  return data;
};

const base64ToJson = data => {
  const jsonData = unescape(atob(data || dataSpecified)).replaceAll("\\n", "\n");
  return typeof jsonData === 'string' ? JSON.parse("{" + jsonData + "}") : jsonData;
};

const toRGB = (hex, reversed, integer) => {
  if (reversed) return '#' + hex.match(/[\d]+/g).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
  if (integer) return parseInt(hex.match(/[\d]+/g).map(x => parseInt(x).toString(16).padStart(2, '0')).join(''), 16);
  if (hex.includes(',')) return hex.match(/[\d]+/g);
  hex = hex.replace('#', '').match(/.{1,2}/g)
  return [parseInt(hex[0], 16), parseInt(hex[1], 16), parseInt(hex[2], 16), 1];
};

const reverse = (reversed, callback) => {
  const side = document.querySelector(reversed ? '.side2' : '.side1');
  if (side.nextElementSibling) side.parentElement.insertBefore(side.nextElementSibling, side);
  else side.parentElement.insertBefore(side, side.parentElement.firstElementChild);

  const isReversed = document.body.classList.toggle('reversed');
  if (autoParams) isReversed ? urlOptions({ set: ['reverse', ''] }) : urlOptions({ remove: 'reverse' });
};

const urlOptions = ({ remove, set }) => {
  const url = currentURL();
  if (remove) url.searchParams.delete(remove);
  if (set) url.searchParams.set(set[0], set[1]);
  try {
    history.replaceState(null, null, url.href.replace(/(?<!data=[^=]+|=)=(&|$)/g, x => x === '=' ? '' : '&'));
  } catch (e) {
    // Most likely embeded in iframe
    console.message(`${e.name}: ${e.message}`, e);
    // if (e.name === 'SecurityError')
    //     window.top.location.href = href;
  }
};

const animateGuiEmbedNameAt = (i, text) => {
  const guiEmbedName = document.querySelectorAll('.gui .guiEmbedName')?.[i];
  // Shake animation
  guiEmbedName?.animate(
      [{ transform: 'translate(0, 0)' },
        { transform: 'translate(10px, 0)' },
        { transform: 'translate(0, 0)' }],
      { duration: 100, iterations: 3 });

  text && (guiEmbedName?.style.setProperty('--text', `"${text}"`));

  guiEmbedName?.scrollIntoView({ behavior: "smooth", block: "center" });
  guiEmbedName?.classList.remove('empty');
  setTimeout(() => guiEmbedName?.classList.add('empty'), 10);
}

const indexOfEmptyGuiEmbed = text => {
  for (const [i, element] of document.querySelectorAll('.msgEmbed>.container .embed').entries())
    if (element.classList.contains('emptyEmbed')) {
      text !== false && animateGuiEmbedNameAt(i, text);
      return i;
    }

  if (!(0 in Object.keys((json || {})))) {
    text !== false && animateGuiEmbedNameAt(i, text);
    return i;
  }

  return -1;
}

// Called after building embed for extra work.
const afterBuilding = () => {
  autoUpdateURL && urlOptions({ set: ['data', jsonToBase64(json)] });
}

// Parses emojis to images and adds code highlighting.
const externalParsing = ({ noEmojis, element } = {}) => {
  !noEmojis && twemoji.parse(element || document.querySelector('.msgEmbed'));
  for (const block of document.querySelectorAll('.markup pre > code'))
    hljs.highlightBlock(block);

  const embed = element?.closest('.embed');
  if (embed?.innerText.trim())
    document.body.classList.remove('emptyEmbed');

  afterBuilding()
};

let mainKeys = ["author", "footer", "color", "thumbnail", "image", "fields", "title", "description", "url", "timestamp"],
    jsonKeys = ["embed", ...mainKeys],
    // 'jsonObject' is used internally, do not change it's value. Use 'json = ...' instead.
    jsonObject = window.json || {
      title: "Please read me! :wave:",
      description: "You can use this tool for our welcome and leave messages, custom commands and birthday announcer!\nTo get your embed, click the copy button on the top of the screen.\nIf you ever get lost, check out the wiki or ask in our support server.",
      color:  "ff69b4",
      author: "Click me to invite Mantaro to your server!",
      authorUrl: "https://add.mantaro.site/",
      authorImg: "https://cdn.discordapp.com/avatars/213466096718708737/84b83a87f8e7a1475f989cbbd76c48d8.png",
      thumbnail: "https://cdn.discordapp.com/emojis/654322747094073365.png",
      image: "https://cdn.discordapp.com/splashes/213468583252983809/e363455219eea72dd569a6d5d20db313.jpg?size=2048",
      footer: "Have a nice day!",
      footerImg: "https://cdn.discordapp.com/avatars/213466096718708737/84b83a87f8e7a1475f989cbbd76c48d8.png",
      fields: [
        {
          name: "Our support server",
          value: "[Click here!](https://support.mantaro.site/)"
        },
        {
          name: "Our wiki",
          value: "[Click here!](https://github.com/Mantaro/MantaroBot/wiki)",
          inline: true
        },
        {
          name: "Our ToS",
          value: "[Click here!](https://github.com/Mantaro/MantaroBot/wiki/Terms-of-Service)",
          inline: true
        },
        {
          name: "Our Patreon",
          value: "[Click here!](https://www.patreon.com/mantaro)",
          inline: true
        }
      ]
    }

if (dataSpecified)
  jsonObject = base64ToJson();

if (allowPlaceholders)
  allowPlaceholders = params.get('placeholders') === 'errors' ? 1 : 2;

addEventListener('DOMContentLoaded', () => {
  if (reverseColumns || localStorage.getItem('reverseColumns'))
    reverse();
  if (autoParams)
    document.querySelector('.item.auto-params > input').checked = true;
  if (hideMenu)
    document.querySelector('.top-btn.menu').classList.add('hidden');
  if (inIframe)
      // Remove menu options that don't work in iframe.
    for (const e of document.querySelectorAll('.no-frame'))
      e.remove();

  if (autoUpdateURL) {
    document.body.classList.add('autoUpdateURL');
    document.querySelector('.item.auto > input').checked = true;
  }

  if (hideEditor) {
    document.body.classList.add('no-editor');
    document.querySelector('.toggle .toggles .editor input').checked = false;
  }

  if (hidePreview) {
    document.body.classList.add('no-preview');
    document.querySelector('.toggle .toggles .preview input').checked = false;
  }

  if (onlyEmbed) document.body.classList.add('only-embed');
  else {
    document.querySelector('.side1.noDisplay')?.classList.remove('noDisplay');
    if (useJsonEditor)
      document.body.classList.remove('gui');
  }

  if (noUser) {
    document.body.classList.add('no-user');
    if (autoParams) noUser ? urlOptions({ set: ['nouser', ''] }) : urlOptions({ remove: 'nouser' });
  } else {
    if (username) document.querySelector('.username').textContent = username;
    if (avatar) document.querySelector('.avatar').src = avatar;
    if (verified) document.querySelectorAll('.msgEmbed > .contents').forEach(e => e.classList.add('verified'));
  }

  for (const e of document.querySelectorAll('.clickable > img'))
    e.parentElement.addEventListener('mouseup', el => window.open(el.target.src));

  const editorHolder = document.querySelector('.editorHolder'),
      guiParent = document.querySelector('.top'),
      embedContent = document.querySelector('.messageContent'),
      embedCont = document.querySelector('.msgEmbed>.container'),
      gui = guiParent.querySelector('.gui:first-of-type');

  editor = CodeMirror(elt => editorHolder.parentNode.replaceChild(elt, editorHolder), {
    value: stringify(json),
    gutters: ["CodeMirror-foldgutter", "CodeMirror-lint-markers"],
    scrollbarStyle: "overlay",
    mode: "application/json",
    theme: 'material-darker',
    matchBrackets: true,
    foldGutter: true,
    extraKeys: {
      // Fill in indent spaces on a new line when enter (return) key is pressed.
      Enter: _ => {
        const cursor = editor.getCursor();
        const end = editor.getLine(cursor.line);
        const leadingSpaces = end.replace(/\S($|.)+/g, '') || '    \n';
        const nextLine = editor.getLine(cursor.line + 1);

        if ((nextLine === undefined || !nextLine.trim()) && !end.substr(cursor.ch).trim())
          editor.replaceRange('\n', { line: cursor.line, ch: cursor.ch });
        else
          editor.replaceRange(`\n${end.endsWith('{') ? leadingSpaces + '    ' : leadingSpaces}`, {
            line: cursor.line,
            ch: cursor.ch
          });
      },
    }
  });

  editor.focus();

  const notif = document.querySelector('.notification');

  error = (msg, time = '5s') => {
    notif.innerHTML = msg;
    notif.style.removeProperty('--startY');
    notif.style.removeProperty('--startOpacity');
    notif.style.setProperty('--time', time);
    notif.onanimationend = () => notif.style.display = null;

    // If notification element is not already visible, (no other message is already displayed), dispaly it.
    if (!notif.style.display)
      return notif.style.display = 'block', false;

    // If there's a message already diplayed, update it and delay animating out.
    notif.style.setProperty('--startY', 0);
    notif.style.setProperty('--startOpacity', 1);
    notif.style.display = null;
    setTimeout(() => notif.style.display = 'block', .5);

    return false;
  };

  const url = (url) => /^(https?:)?\/\//g.exec(url) ? url : '//' + url;

  const makeShort = (txt, length, mediaWidth) => {
    if (mediaWidth && matchMedia(`(max-width:${mediaWidth}px)`).matches)
      return txt.length > (length - 3) ? txt.substring(0, length - 3) + '...' : txt;
    return txt;
  }

  const allGood = embedObj => {
    let invalid, err;
    let str = stringify(embedObj)
    let re = /("(?:icon_)?url": *")((?!\w+?:\/\/).+)"/g.exec(str);

    if (embedObj.timestamp && new Date(embedObj.timestamp).toString() === "Invalid Date") {
      if (allowPlaceholders === 2) return true;
      if (!allowPlaceholders) invalid = true, err = 'Timestamp is invalid';
    } else if (re) { // If a URL is found without a protocol
      if (!/\w+:|\/\/|^\//g.exec(re[2]) && re[2].includes('.')) {
        let activeInput = document.querySelector('input[class$="link" i]:focus')
        if (activeInput && !allowPlaceholders) {
          lastPos = activeInput.selectionStart + 7;
          activeInput.value = `http://${re[2]}`;
          activeInput.setSelectionRange(lastPos, lastPos)
          return true;
        }
      }
      if (allowPlaceholders !== 2)
        invalid = true, err = (`URL should have a protocol. Did you mean <span class="inline full short">http://${makeShort(re[2], 30, 600).replace(' ', '')}</span>?`);
    }

    if (invalid) {
      validationError = true;
      return error(err);
    }

    return true;
  }

  const markup = (txt, { replaceEmojis, inlineBlock, inEmbed }) => {
    if (replaceEmojis)
      txt = txt.replace(/(?<!code(?: \w+=".+")?>[^>]+)(?<!\/[^\s"]+?):((?!\/)\w+):/g, (match, p) => p && emojis[p] ? emojis[p] : match);

    txt = txt
        /** Markdown */
        .replace(/&#60;:\w+:(\d{18})&#62;/g, '<img class="emoji" src="https://cdn.discordapp.com/emojis/$1.png"/>')
        .replace(/&#60;a:\w+:(\d{18})&#62;/g, '<img class="emoji" src="https://cdn.discordapp.com/emojis/$1.gif"/>')
        .replace(/~~(.+?)~~/g, '<s>$1</s>')
        .replace(/\*\*\*(.+?)\*\*\*/g, '<em><strong>$1</strong></em>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<u>$1</u>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        // Replace >>> and > with block-quotes. &#62; is HTML code for >
        .replace(/^(?: *&#62;&#62;&#62; ([\s\S]*))|(?:^ *&#62;(?!&#62;&#62;) +.+\n)+(?:^ *&#62;(?!&#62;&#62;) .+\n?)+|^(?: *&#62;(?!&#62;&#62;) ([^\n]*))(\n?)/mg, (all, match1, match2, newLine) => {
          return `<div class="blockquote"><div class="blockquoteDivider"></div><blockquote>${match1 || match2 || newLine ? match1 || match2 : all.replace(/^ *&#62; /gm, '')}</blockquote></div>`;
        })

        /** Mentions */
        .replace(/&#60;#\d+&#62;/g, () => `<span class="mention channel interactive">channel</span>`)
        .replace(/&#60;@(?:&#38;|!)?\d+&#62;|@(?:everyone|here)/g, match => {
          if (match.startsWith('@')) return `<span class="mention">${match}</span>`
          else return `<span class="mention interactive">@${match.includes('&#38;') ? 'role' : 'user'}</span>`
        })

    if (inlineBlock)
        // Treat both inline code and code blocks as inline code
      txt = txt.replace(/`([^`]+?)`|``([^`]+?)``|```((?:\n|.)+?)```/g, (m, x, y, z) => x ? `<code class="inline">${x}</code>` : y ? `<code class="inline">${y}</code>` : z ? `<code class="inline">${z}</code>` : m);
    else {
      // Code block
      txt = txt.replace(/```(?:([a-z0-9_+\-.]+?)\n)?\n*([^\n][^]*?)\n*```/ig, (m, w, x) => {
        if (w) return `<pre><code class="${w}">${x.trim()}</code></pre>`
        else return `<pre><code class="hljs nohighlight">${x.trim()}</code></pre>`
      });
      // Inline code
      txt = txt.replace(/`([^`]+?)`|``([^`]+?)``/g, (m, x, y, z) => x ? `<code class="inline">${x}</code>` : y ? `<code class="inline">${y}</code>` : z ? `<code class="inline">${z}</code>` : m)
    }

    if (inEmbed)
      txt = txt.replace(/\[([^\[\]]+)\]\((.+?)\)/g, `<a title="$1" target="_blank" class="anchor" href="$2">$1</a>`);

    return txt;
  }


  const createEmbedFields = (fields, embedFields) => {
    embedFields.innerHTML = '';
    let index, gridCol;

    for (const [i, f] of fields.entries()) {
      if (f.name && f.value) {
        const fieldElement = embedFields.insertBefore(document.createElement('div'), null);
        // Figuring out if there are only two fields on a row to give them more space.
        // e.fields = json.embeds.fields.

        // if both the field of index 'i' and the next field on its right are inline and -
        if (fields[i].inline && fields[i + 1]?.inline &&
            // it's the first field in the embed or -
            ((i === 0 && fields[i + 2] && !fields[i + 2].inline) || ((
                // it's not the first field in the embed but the previous field is not inline or -
                i > 0 && !fields[i - 1].inline ||
                // it has 3 or more fields behind it and 3 of those are inline except the 4th one back if it exists -
                i >= 3 && fields[i - 1].inline && fields[i - 2].inline && fields[i - 3].inline && (fields[i - 4] ? !fields[i - 4].inline : !fields[i - 4])
                // or it's the first field on the last row or the last field on the last row is not inline or it's the first field in a row and it's the last field on the last row.
            ) && (i == fields.length - 2 || !fields[i + 2].inline))) || i % 3 === 0 && i == fields.length - 2) {
          // then make the field halfway (and the next field will take the other half of the embed).
          index = i, gridCol = '1 / 7';
        }
        // The next field.
        if (index === i - 1)
          gridCol = '7 / 13';

        if (!f.inline)
          fieldElement.outerHTML = `
                        <div class="embedField" style="grid-column: 1 / 13;">
                            <div class="embedFieldName">${markup(encodeHTML(f.name), {
            inEmbed: true,
            replaceEmojis: true,
            inlineBlock: true
          })}</div>
                            <div class="embedFieldValue">${markup(encodeHTML(f.value), {
            inEmbed: true,
            replaceEmojis: true
          })}</div>
                        </div>`;
        else {
          if (i && !fields[i - 1].inline) colNum = 1;

          fieldElement.outerHTML = `
                        <div class="embedField ${num}${gridCol ? ' colNum-2' : ''}" style="grid-column: ${gridCol || (colNum + ' / ' + (colNum + 4))};">
                            <div class="embedFieldName">${markup(encodeHTML(f.name), {
            inEmbed: true,
            replaceEmojis: true,
            inlineBlock: true
          })}</div>
                            <div class="embedFieldValue">${markup(encodeHTML(f.value), {
            inEmbed: true,
            replaceEmojis: true
          })}</div>
                        </div>`;

          if (index !== i) gridCol = false;
        }

        colNum = (colNum === 9 ? 1 : colNum + 4);
        num++;
      }
      ;
    }
    ;


    for (const e of document.querySelectorAll('.embedField[style="grid-column: 1 / 5;"]'))
      if (!e.nextElementSibling || e.nextElementSibling.style.gridColumn === '1 / 13')
        e.style.gridColumn = '1 / 13';
    colNum = 1;

    display(embedFields, undefined, 'grid');
  }

  const smallerScreen = matchMedia('(max-width: 1015px)');

  const encodeHTML = str => str.replace(/[\u00A0-\u9999<>\&]/g, i => '&#' + i.charCodeAt(0) + ';');

  const timestamp = stringISO => {
    const date = stringISO ? new Date(stringISO) : new Date(),
        dateArray = date.toLocaleString('en-US', { hour: 'numeric', hour12: false, minute: 'numeric' }),
        today = new Date(),
        yesterday = new Date(new Date().setDate(today.getDate() - 1)),
        tommorrow = new Date(new Date().setDate(today.getDate() + 1));

    return today.toDateString() === date.toDateString() ? `Today at ${dateArray}` :
        yesterday.toDateString() === date.toDateString() ? `Yesterday at ${dateArray}` :
            tommorrow.toDateString() === date.toDateString() ? `Tomorrow at ${dateArray}` :
                `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
  }

  const display = (el, data, displayType) => {
    if (data) el.innerHTML = data
    el.style.display = displayType || "unset";
  }

  const hide = el => el.style.removeProperty('display'),
      imgSrc = (elm, src, remove) => remove ? elm.style.removeProperty('content') : elm.style.content = `url(${src})`;

  const [guiFragment, fieldFragment, embedFragment, guiEmbedAddFragment] = Array.from({ length: 4 }, () => document.createDocumentFragment());
  embedFragment.appendChild(document.querySelector('.embed.markup').cloneNode(true));
  guiEmbedAddFragment.appendChild(document.querySelector('.guiEmbedAdd').cloneNode(true));
  fieldFragment.appendChild(document.querySelector('.edit>.fields>.field').cloneNode(true));

  document.querySelector('.embed.markup').remove();
  gui.querySelector('.edit>.fields>.field').remove();

  for (const child of gui.childNodes)
    guiFragment.appendChild(child.cloneNode(true));

  // Renders the GUI editor with json data from 'jsonObject'.
  buildGui = (object = jsonObject, opts) => {
    gui.innerHTML = '';
    gui.appendChild(guiEmbedAddFragment.firstChild.cloneNode(true))
        .addEventListener('click', () => {
          if (indexOfEmptyGuiEmbed('(empty embed)') !== -1) return;
          jsonObject = {};
          buildGui();
        });

    for (const child of Array.from(guiFragment.childNodes)) {
      if (child.classList?.[1] === 'content')
        gui.insertBefore(gui.appendChild(child.cloneNode(true)), gui.appendChild(child.nextElementSibling.cloneNode(true))).nextElementSibling.firstElementChild.value = object.content || '';
      else if (child.classList?.[1] === 'guiEmbedName') {
        var embed = object;
        const guiEmbedName = gui.appendChild(child.cloneNode(true))

        guiEmbedName.querySelector('.text').innerHTML = `Embed ${embed.title ? `: <span>${embed.title}</span>` : ''}`;
        guiEmbedName.querySelector('.icon').addEventListener('click', () => {
          object = {};
          buildGui();
          buildEmbed();
        });

        const guiEmbed = gui.appendChild(createElement({ 'div': { className: 'guiEmbed' } }));
        const guiEmbedTemplate = child.nextElementSibling;

        for (const child2 of Array.from(guiEmbedTemplate.children)) {
          if (!child2.classList.contains('edit')) {
            const row = guiEmbed.appendChild(child2.cloneNode(true));
            const edit = child2.nextElementSibling?.cloneNode(true);
            edit?.classList.contains('edit') && guiEmbed.appendChild(edit);

            switch (child2.classList[1]) {
              case 'author':
                const authorURL = embed?.authorImg || '';
                if (authorURL)
                  edit.querySelector('.imgParent').style.content = 'url(' + encodeHTML(authorURL) + ')';
                edit.querySelector('.editAuthorLink').value = authorURL;
                edit.querySelector('.editAuthorUrl').value = embed?.authorUrl || '';
                edit.querySelector('.editAuthorName').value = embed?.author || '';
                break;
              case 'title':
                edit.querySelector('.editTitle').value = embed?.title || '';
                break;
              case 'description':
                edit.querySelector('.editDescription').value = embed?.description || '';
                break;
              case 'thumbnail':
                const thumbnailURL = embed?.thumbnail || '';
                if (thumbnailURL)
                  edit.querySelector('.imgParent').style.content = 'url(' + encodeHTML(thumbnailURL) + ')';
                edit.querySelector('.editThumbnailLink').value = thumbnailURL;
                break;
              case 'image':
                const imageURL = embed?.image || '';
                if (imageURL)
                  edit.querySelector('.imgParent').style.content = 'url(' + encodeHTML(imageURL) + ')';
                edit.querySelector('.editImageLink').value = imageURL;
                break;
              case 'footer':
                const footerURL = embed?.footerImg || '';
                if (footerURL)
                  edit.querySelector('.imgParent').style.content = 'url(' + encodeHTML(footerURL) + ')';
                edit.querySelector('.editFooterLink').value = footerURL;
                edit.querySelector('.editFooterText').value = embed?.footer || '';
                break;
              case 'fields':
                for (const f of embed?.fields || []) {
                  const fields = edit.querySelector('.fields');
                  const field = fields.appendChild(createElement({ 'div': { className: 'field' } }));

                  for (const child of Array.from(fieldFragment.firstChild.children)) {
                    const newChild = field.appendChild(child.cloneNode(true));

                    if (child.classList.contains('inlineCheck'))
                      newChild.querySelector('input').checked = !!f.inline;

                    else if (f.value && child.classList?.contains('fieldInner'))
                      newChild.querySelector('.designerFieldName input').value = f.name || '',
                          newChild.querySelector('.designerFieldValue textarea').value = f.value || '';
                  }
                }
            }
          }
        }
      }

      // Expand last embed in GUI
      const names = gui.querySelectorAll('.guiEmbedName');
      names[names.length - 1]?.classList.add('active');
    }

    for (const e of document.querySelectorAll('.top>.gui .item'))
      e.addEventListener('click', el => {
        if (e?.classList.contains('active'))
          getSelection().anchorNode !== e && e.classList.remove('active');
        else if (e) {
          const inlineField = e.closest('.inlineField'),
              input = e.nextElementSibling?.querySelector('input[type="text"]'),
              txt = e.nextElementSibling?.querySelector('textarea');

          e.classList.add('active');

          if (inlineField)
            inlineField.querySelector('.ttle~input').focus();

          else if (input) {
            !smallerScreen.matches && input.focus();
            input.selectionStart = input.selectionEnd = input.value.length;
          } else if (txt && !smallerScreen.matches)
            txt.focus();

          if (e.classList.contains('fields')) {
            if (reverseColumns && smallerScreen.matches)
                // return elm.nextElementSibling.scrollIntoView({ behavior: 'smooth', block: "end" });
              return e.parentNode.scrollTop = e.offsetTop;

            e.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      })

    title = gui.querySelector('.editTitle');
    authorName = gui.querySelector('.editAuthorName');
    authorLink = gui.querySelector('.editAuthorLink');
    authorUrl = gui.querySelector('.editAuthorUrl');
    desc = gui.querySelector('.editDescription');
    thumbLink = gui.querySelector('.editThumbnailLink');
    imgLink = gui.querySelector('.editImageLink');
    footerText = gui.querySelector('.editFooterText');
    footerLink = gui.querySelector('.editFooterLink');

    // Scroll into view when tabs are opened in the GUI.
    const lastTabs = Array.from(document.querySelectorAll('.footer.rows2, .image.largeImg'));
    const requiresView = matchMedia(`${smallerScreen.media}, (max-height: 845px)`);
    const addGuiEventListeners = () => {
      for (const e of document.querySelectorAll('.gui .item:not(.fields)'))
        e.onclick = () => {
          if (lastTabs.includes(e) || requiresView.matches) {
            if (!reverseColumns || !smallerScreen.matches)
              e.scrollIntoView({ behavior: 'smooth', block: "center" });
            else if (e.nextElementSibling.classList.contains('edit') && e.classList.contains('active'))
                // e.nextElementSibling.scrollIntoView({ behavior: 'smooth', block: "end" });
              e.parentNode.scrollTop = e.offsetTop;
          }
        };

      for (const e of document.querySelectorAll('.addField'))
        e.onclick = () => {
          const guiEmbed = e.closest('.guiEmbed');
          const indexOfGuiEmbed = Array.from(gui.querySelectorAll('.guiEmbed')).indexOf(guiEmbed);
          if (indexOfGuiEmbed === -1) return error('Could not find the embed to add the field to.');

          const fieldsObj = (jsonObject.fields ??= []);
          if (fieldsObj.length >= 25) return error('Cannot have more than 25 fields');
          fieldsObj.push({ name: "Field name", value: "Field value", inline: false });

          const newField = guiEmbed?.querySelector('.item.fields+.edit>.fields')?.appendChild(fieldFragment.firstChild.cloneNode(true));

          buildEmbed();
          addGuiEventListeners();

          newField.scrollIntoView({ behavior: "smooth", block: "center" });
          if (!smallerScreen.matches) {
            const firstFieldInput = newField.querySelector('.designerFieldName input');

            firstFieldInput?.setSelectionRange(firstFieldInput.value.length, firstFieldInput.value.length);
            firstFieldInput?.focus();
          }
        };

      for (const e of document.querySelectorAll('.fields .field .removeBtn'))
        e.onclick = () => {
          const fieldIndex = Array.from(e.closest('.fields').children).indexOf(e.closest('.field'));

          if (jsonObject.fields[fieldIndex] === -1)
            return error('Failed to find the index of the field to remove.');

          jsonObject.fields.splice(fieldIndex, 1);
          if (jsonObject.fields.length <= 0) delete jsonObject.fields;

          buildEmbed();
          e.closest('.field').remove();
        };

      for (const e of gui.querySelectorAll('textarea, input'))
        e.oninput = el => {
          const value = el.target.value;
          const field = el.target.closest('.field');
          const fields = field?.closest('.fields');
          const embedObj = jsonObject ??= {};

          if (field) {
            const fieldIndex = Array.from(fields.children).indexOf(field);
            const jsonField = embedObj.fields[fieldIndex];
            const embedFields = document.querySelectorAll('.container>.embed')[0]?.querySelector('.embedFields');

            if (jsonField) {
              if (el.target.type === 'text') jsonField.name = value;
              else if (el.target.type === 'textarea') jsonField.value = value;
              else jsonField.inline = el.target.checked;
              createEmbedFields(embedObj.fields, embedFields);
            }
          } else {
            switch (el.target.classList?.[0]) {
              case 'editTitle':
                embedObj.title = value;
                const guiEmbedName = el.target.closest('.guiEmbed')?.previousElementSibling;
                if (guiEmbedName?.classList.contains('guiEmbedName'))
                  guiEmbedName.querySelector('.text').innerHTML = `${guiEmbedName.innerText.split(':')[0]}${value ? `: <span>${value}</span>` : ''}`;
                buildEmbed({ only: 'embedTitle', index: 0 });
                if (embedObj.title === "") delete embedObj.title
                break;
              case 'editAuthorName':
                embedObj.author ??= {}
                embedObj.author = value;
                if (embedObj.author === "") delete embedObj.author
                buildEmbed({ only: 'embedAuthorName', index: 0 });
                break;
              case 'editAuthorLink':
                embedObj.authorImg ??= {}
                embedObj.authorImg = value;
                imgSrc(document.querySelector("label[for='" + el.target.id + "'] .imgParent"), value);
                buildEmbed({ only: 'embedAuthorLink', index: 0 });
                if (embedObj.authorImg === "") delete embedObj.authorImg
                break;
              case 'editAuthorUrl':
                embedObj.authorUrl ??= {}
                embedObj.authorUrl = value;
                buildEmbed({ only: 'editAuthorUrl', index: 0 });
                if (embedObj.authorUrl === "") delete embedObj.authorUrl
                break;
              case 'editDescription':
                embedObj.description = value;
                buildEmbed({ only: 'embedDescription', index: 0 });
                if (embedObj.description === "") delete embedObj.description
                break;
              case 'editThumbnailLink':
                embedObj.thumbnail ??= {}
                embedObj.thumbnail = value;
                imgSrc(el.target.closest('.editIcon').querySelector('.imgParent'), value);
                buildEmbed({ only: 'embedThumbnail', index: 0 });
                if (embedObj.thumbnail === "") delete embedObj.thumbnail
                break;
              case 'editImageLink':
                embedObj.image ??= {}
                embedObj.image = value;
                imgSrc(el.target.closest('.editIcon').querySelector('.imgParent'), value);
                buildEmbed({ only: 'embedImageLink', index: 0 });
                if (embedObj.image === "") delete embedObj.image
                break;
              case 'editFooterText':
                embedObj.footer ??= {}
                embedObj.footer = value;
                buildEmbed({ only: 'embedFooterText', index: 0 });
                if (embedObj.footer === "") delete embedObj.footer
                break;
              case 'editFooterLink':
                embedObj.footerImg ??= {}
                embedObj.footerImg = value;
                imgSrc(document.querySelector("label[for='" + el.target.id + "'] .imgParent"), value);
                buildEmbed({ only: 'embedFooterLink', index: 0 });
                if (embedObj.footerImg === "") delete embedObj.footerImg
                break;
            }
          }

          if (Object.keys(embedObj).length < 1) {
            document.querySelector('.gui')?.classList.add('emptyEmbed');
            document.querySelectorAll('.msgEmbed>.container')[0]?.querySelector('.embed')?.classList.add('emptyEmbed');
            document.querySelectorAll('.msgEmbed')[1].children[1].innerText = "Empty Embed";
          } else {
            document.querySelectorAll('.msgEmbed>.container')[0]?.querySelector('.emptyEmbed')?.classList.remove('emptyEmbed');
            document.querySelectorAll('.msgEmbed')[1].children[1].innerText = "";
          }
        }
    }

    addGuiEventListeners();


    if (opts?.activateClassNames)
      for (const cName of opts.activateClassNames)
        for (const e of document.getElementsByClassName(cName))
          e.classList.add('active');

    else if (opts?.guiTabs) {
      const tabs = opts.guiTabs.split?.(/, */) || opts.guiTabs;
      const bottomKeys = ['footer', 'image'];
      const topKeys = ['author', 'content'];


      // Deactivate the default activated GUI fields
      for (const e of gui.querySelectorAll('.item:not(.guiEmbedName).active'))
        e.classList.remove('active');

      // Activate wanted GUI fields
      for (const e of document.querySelectorAll(`.${tabs.join(', .')}`))
        e.classList.add('active');

      // Autoscroll GUI to the bottom if necessary.
      if (!tabs.some(item => topKeys.includes(item)) && tabs.some(item => bottomKeys.includes(item))) {
        const gui2 = document.querySelector('.top .gui');
        gui2.scrollTo({ top: gui2.scrollHeight });
      }
    } else if (opts?.activate)
      for (const clss of Array.from(opts.activate).map(el => el.className).map(clss => '.' + clss.split(' ').slice(0, 2).join('.')))
        for (const e of document.querySelectorAll(clss))
          e.classList.add('active');

    else for (const clss of document.querySelectorAll('.item.author, .item.description'))
        clss.classList.add('active');
  }

  buildGui(jsonObject, { guiTabs });
  gui.classList.remove('hidden');

  fields = gui.querySelector('.fields ~ .edit .fields');

  // Renders embed and message content.
  buildEmbed = ({ jsonData, only, index = 0 } = {}) => {
    if (jsonData) json = jsonData;
    if (!jsonObject) {
      document.body.classList.add('emptyEmbed');
      document.querySelectorAll('.msgEmbed')[1].children[1].innerText = "";
    }

    try {
      const embed = document.querySelectorAll('.container>.embed')[0];
      const embedObj = jsonObject;

      if (only && (!embed || !embedObj)) return buildEmbed();

      switch (only) {
          // If only updating the message content and nothing else, return here.
        case 'content':
          return externalParsing({ element: embedContent });
        case 'embedTitle':
          const embedTitle = embed?.querySelector('.embedTitle');
          if (!embedTitle) return buildEmbed();
          if (!embedObj.title) hide(embedTitle);
          else display(embedTitle, markup(`${encodeHTML(embedObj.title)}`, {
            replaceEmojis: true,
            inlineBlock: true
          }));

          return externalParsing({ element: embedTitle });
        case 'embedAuthorName':
        case 'embedAuthorLink':
          const embedAuthor = embed?.querySelector('.embedAuthor');
          if (!embedAuthor) return buildEmbed();
          if (!embedObj.author) hide(embedAuthor);
          else display(embedAuthor, `
                        ${embedObj.authorImg ? '<img class="embedAuthorIcon embedAuthorLink" src="' + encodeHTML(url(embedObj.authorImg)) + '">' : ''}
                        ${embedObj.authorUrl ? '<a class="embedAuthorNameLink embedLink embedAuthorName" href="' + encodeHTML(url(embedObj.authorUrl)) + '" target="_blank">' + encodeHTML(embedObj.author) + '</a>' : '<span class="embedAuthorName">' + encodeHTML(embedObj.author) + '</span>'}`, 'flex');

          return externalParsing({ element: embedAuthor });
        case 'embedDescription':
          const embedDescription = embed?.querySelector('.embedDescription');
          if (!embedDescription) return buildEmbed();
          if (!embedObj.description) hide(embedDescription);
          else display(embedDescription, markup(encodeHTML(embedObj.description), {
            inEmbed: true,
            replaceEmojis: true
          }));

          return externalParsing({ element: embedDescription });
        case 'embedThumbnail':
          const embedThumbnailLink = embed?.querySelector('.embedThumbnailLink');
          if (!embedThumbnailLink) return buildEmbed();
          const pre = embed.querySelector('.embedGrid .markup pre');
          if (embedObj.thumbnail) {
            embedThumbnailLink.src = embedObj.thumbnail;
            embedThumbnailLink.parentElement.style.display = 'block';
            if (pre) pre.style.maxWidth = '90%';
          } else {
            hide(embedThumbnailLink.parentElement)
            pre?.style.removeProperty('max-width');
          }

          return afterBuilding();
        case 'embedImage':
          const embedImageLink = embed?.querySelector('.embedImageLink');
          if (!embedImageLink) return buildEmbed();
          if (!embedObj.image) {
            hide(embedImageLink.parentElement);
          } else embedImageLink.src = embedObj.image,
              embedImageLink.parentElement.style.display = 'block';


          return afterBuilding();
        case 'embedFooterText':
        case 'embedFooterLink':
        case 'embedFooterTimestamp':
          const embedFooter = embed?.querySelector('.embedFooter');
          if (!embedFooter) return buildEmbed();
          if (!embedObj.footer) hide(embedFooter);
          else display(embedFooter, `
                        ${embedObj.footerImg ? '<img class="embedFooterIcon embedFooterLink" src="' + encodeHTML(url(embedObj.footerImg)) + '">' : ''}<span class="embedFooterText">
                        ${encodeHTML(embedObj.footer)}`, 'flex');

          return externalParsing({ element: embedFooter });
      }

      const obj = jsonObject;
      if (!allGood(obj)) return;
      embedCont.innerHTML = '';

      validationError = false;

      const embedElement = embedCont.appendChild(embedFragment.firstChild.cloneNode(true));
      const embedGrid = embedElement.querySelector('.embedGrid');
      const msgEmbed = embedElement.querySelector('.msgEmbed');
      const embedTitle = embedElement.querySelector('.embedTitle');
      const embedDescription = embedElement.querySelector('.embedDescription');
      const embedAuthor = embedElement.querySelector('.embedAuthor');
      const embedFooter = embedElement.querySelector('.embedFooter');
      const embedImage = embedElement.querySelector('.embedImage > img');
      const embedThumbnail = embedElement.querySelector('.embedThumbnail > img');
      const embedFields = embedElement.querySelector('.embedFields');

      if (obj.title) display(embedTitle, markup(`${encodeHTML(obj.title)}`, {
        replaceEmojis: true,
        inlineBlock: true
      }));
      else hide(embedTitle);

      if (obj.description) display(embedDescription, markup(encodeHTML(obj.description), {
        inEmbed: true,
        replaceEmojis: true
      }));
      else hide(embedDescription);

      if (obj.color) embedGrid.closest('.embed').style.borderColor = (typeof obj.color === 'number' ? '#' + obj.color.toString(16).padStart(6, "0") : '#' + obj.color.replace("0x", ""));
      else embedGrid.closest('.embed').style.removeProperty('border-color');

      if (obj.author) display(embedAuthor, `
                    ${obj.authorImg ? '<img class="embedAuthorIcon embedAuthorLink" src="' + encodeHTML(url(obj.authorImg)) + '">' : ''}
                    ${obj.authorUrl ? '<a class="embedAuthorNameLink embedLink embedAuthorName" href="' + encodeHTML(url(obj.authorUrl)) + '" target="_blank">' + encodeHTML(obj.author) + '</a>' : '<span class="embedAuthorName">' + encodeHTML(obj.author) + '</span>'}`, 'flex');
      else hide(embedAuthor);

      const pre = embedGrid.querySelector('.markup pre');
      if (obj.thumbnail) {
        embedThumbnail.src = obj.thumbnail;
        embedThumbnail.parentElement.style.display = 'block';
        if (pre) pre.style.maxWidth = '90%';
      } else {
        hide(embedThumbnail.parentElement);
        if (pre) pre.style.removeProperty('max-width');
      }

      if (obj.image)
        embedImage.src = obj.image,
            embedImage.parentElement.style.display = 'block';
      else hide(embedImage.parentElement);

      if (obj.footer) display(embedFooter, `
                    ${obj.footerImg ? '<img class="embedFooterIcon embedFooterLink" src="' + encodeHTML(url(obj.footerImg)) + '">' : ''}<span class="embedFooterText">
                        ${encodeHTML(obj.footer)}`, 'flex');
      else hide(embedFooter);

      if (obj.fields) createEmbedFields(obj.fields, embedFields);
      else hide(embedFields);

      document.body.classList.remove('emptyEmbed');
      externalParsing();

      if (embedElement.innerText.trim() || embedElement.querySelector('.embedGrid > [style*=display] img')) {
        embedElement.classList.remove('emptyEmbed');
      } else {
        embedElement.classList.add('emptyEmbed');
      }


      // Make sure that the embed has no text or any visible images such as custom emojis before hiding.
      if (!embedCont.innerText.trim() && !embedCont.querySelector('.embedGrid > [style*=display] img')) {
        document.body.classList.add('emptyEmbed');
        embedElement.parentElement.parentElement.children[1].innerText = "Empty Embed";
      } else {
        embedElement.parentElement.parentElement.children[1].innerText = "";
      }


      afterBuilding()
    } catch (e) {
      console.error(e);
      error(e);
    }
  }

  editor.on('change', editor => {
    // If the editor value is not set by the user, reuturn.
    if (stringify(json) === editor.getValue()) {
      return;
    }

    try {
      // Autofill when " is typed on new line
      const line = editor.getCursor().line;
      const text = editor.getLine(line)

      if (text.trim() === '"') {
        editor.replaceRange(text.trim() + ':', { line, ch: line.length });
        editor.setCursor(line, text.length)
      }

      json = JSON.parse("{" + editor.getValue().replace(/"[^"]*(?:""[^"]*)*"/g, s => s.replaceAll("\n", "\\n"))  + "}");
      const dataKeys = Object.keys(json);

      if (dataKeys.length && !jsonKeys.some(key => dataKeys.includes(key))) {
        const usedKeys = dataKeys.filter(key => !jsonKeys.includes(key));
        if (usedKeys.length > 2)
          return error(`'${usedKeys[0] + "', '" + usedKeys.slice(1, usedKeys.length - 1).join("', '")}', and '${usedKeys[usedKeys.length - 1]}' are invalid keys.`);
        return error(`'${usedKeys.length == 2 ? usedKeys[0] + "' and '" + usedKeys[usedKeys.length - 1] + "' are invalid keys." : usedKeys[0] + "' is an invalid key."}`);
      }

      buildEmbed();

    } catch (e) {
      console.log(e)
      if (editor.getValue()) return;
      document.body.classList.add('emptyEmbed');
      embedContent.innerHTML = '';
    }
  });

  const picker = new CP(document.querySelector('.picker'), state = { parent: document.querySelector('.cTop') });

  picker.fire?.('change', toRGB('#ff69b4'));

  let colors = document.querySelector('.colors'),
      hexInput = colors?.querySelector('.hex>div input'),
      typingHex = true, exit = false,

      removePicker = () => {
        if (exit) return exit = false;
        if (typingHex) picker.enter();
        else {
          typingHex = false, exit = true;
          colors.classList.remove('picking');
          picker.exit();
        }
      }
  document.querySelector('.colBack')?.addEventListener('click', () => {
    picker.self.remove();
    typingHex = false;
    removePicker();
  })

  picker.on?.('exit', removePicker);
  picker.on?.('enter', () => {
    if (jsonObject?.color) {
      hexInput.value = jsonObject.color.padStart(6, '0');
      document.querySelector('.hex.incorrect')?.classList.remove('incorrect');
      //Set color square to current color
      const colorRGB = toRGB(jsonObject.color, false, false);
      picker.set(colorRGB[0], colorRGB[1], colorRGB[2], colorRGB[3]);
    }
    colors.classList.add('picking')
  })

  document.querySelectorAll('.color').forEach(e => e.addEventListener('click', el => {
    const embed = document.querySelectorAll('.msgEmbed .container>.embed')[0];
    const embedObj = jsonObject ??= {};

    const clr = el.target.closest('.color');
    embedObj.color = toRGB(clr.style.backgroundColor, false, true).toString(16);
    embed && (embed.style.borderColor = clr.style.backgroundColor);
    picker.source.style.removeProperty('background');
  }))

  hexInput?.addEventListener('focus', () => typingHex = true);
  setTimeout(() => {
    picker.on?.('change', function (r, g, b, a) {
      const embed = document.querySelectorAll('.msgEmbed .container>.embed')[0];
      const embedObj = jsonObject;

      picker.source.style.background = this.color(r, g, b);
      embedObj.color = this.color(r, g, b).slice(1);
      embed.style.borderColor = this.color(r, g, b);
      hexInput.value = embedObj.color.toString(16).padStart(6, '0');
    })
  }, 1000)

  document.querySelectorAll('.timeText').forEach(t => t.innerText = timestamp());

  for (const block of document.querySelectorAll('.markup pre > code'))
    hljs.highlightBlock(block);

  document.querySelector('.opt.gui').addEventListener('click', () => {
    if (lastGuiJson && lastGuiJson !== stringify(json))
      buildGui();

    lastGuiJson = false
    activeFields = null;

    document.body.classList.add('gui');
    if (pickInGuiMode) {
      pickInGuiMode = false;
      togglePicker();
    }
  })

  document.querySelector('.opt.json').addEventListener('click', () => {
    const jsonStr = stringify(json);
    lastGuiJson = jsonStr;

    document.body.classList.remove('gui');
    editor.setValue(jsonStr === '{}' ? '{\n\t\n}' : jsonStr);
    editor.refresh();
    editor.focus();

    activeFields = document.querySelectorAll('.gui > .item.active');
    if (document.querySelector('section.side1.low'))
      togglePicker(true);
  })

  document.querySelector('.clear').addEventListener('click', () => {
    json = {};

    picker.source.style.removeProperty('background');
    document.querySelector('.msgEmbed .container>.embed')?.remove();

    buildEmbed();
    buildGui();

    const jsonStr = stringify(json);
    editor.setValue(jsonStr === '{}' ? '{\n\t\n}' : jsonStr);

    for (const e of document.querySelectorAll('.gui .item'))
      e.classList.add('active');
  })

  document.querySelector('.top-btn.menu')?.addEventListener('click', e => {
    if (e.target.closest('.item.dataLink')) {
      const data = jsonToBase64(json, true).replace(/(?<!data=[^=]+|=)=(&|$)/g, x => x === '=' ? '' : '&');
      if (!window.chrome)
          // With long text inside a 'prompt' on Chromium based browsers, some text will be trimmed off and replaced with '...'.
        return prompt('Here\'s the current URL with base64 embed data:', data);

      // So, for the Chromium users, we copy to clipboard instead of showing a prompt.
      try {
        // Clipboard API might only work on HTTPS protocol.
        navigator.clipboard.writeText(data);
      } catch {
        const input = document.body.appendChild(document.createElement('input'));
        input.value = data;
        input.select();
        document.setSelectionRange(0, 50000);
        document.execCommand('copy');
        document.body.removeChild(input);
      }

      alert('Copied to clipboard.');
    }

    const input = e.target.closest('.item')?.querySelector('input');
    if (input) input.checked = !input.checked;

    if (e.target.closest('.item.auto')) {
      autoUpdateURL = document.body.classList.toggle('autoUpdateURL');
      if (autoUpdateURL) localStorage.setItem('autoUpdateURL', true);
      else localStorage.removeItem('autoUpdateURL');
      urlOptions({ set: ['data', jsonToBase64(json)] });
    } else if (e.target.closest('.item.reverse')) {
      reverse(reverseColumns);
      reverseColumns = !reverseColumns;
      toggleStored('reverseColumns');
    } else if (e.target.closest('.item.noUser')) {
      if (options.avatar) document.querySelector('img.avatar').src = options.avatar;

      const noUser = document.body.classList.toggle('no-user');
      if (autoParams) noUser ? urlOptions({ set: ['nouser', ''] }) : urlOptions({ remove: 'nouser' });
      toggleStored('noUser');
    } else if (e.target.closest('.item.auto-params')) {
      if (input.checked) localStorage.setItem('autoParams', true);
      else localStorage.removeItem('autoParams');
      autoParams = input.checked;
    } else if (e.target.closest('.toggles>.item')) {
      const win = input.closest('.item').classList[2];

      if (input.checked) {
        document.body.classList.remove(`no-${win}`);
        localStorage.removeItem(`hide${win}`);
      } else {
        document.body.classList.add(`no-${win}`);
        localStorage.setItem(`hide${win}`, true);
      }
    }

    e.target.closest('.top-btn').classList.toggle('active')
  })

  document.querySelectorAll('.img').forEach(e => {
    if (e.nextElementSibling?.classList.contains('spinner-container'))
      e.addEventListener('error', el => {
        el.target.style.removeProperty('display');
        el.target.nextElementSibling.style.display = 'block';
      })
  })

  let pickInGuiMode = false;
  togglePicker = pickLater => {
    colors.classList.toggle('display');
    document.querySelector('.side1').classList.toggle('low');
    if (pickLater) pickInGuiMode = true;
  };

  document.querySelector('.pickerToggle').addEventListener('click', () => togglePicker());
  buildEmbed();

  document.body.addEventListener('click', e => {
    if (e.target.classList.contains('low') || (e.target.classList.contains('top') && colors.classList.contains('display')))
      togglePicker();
  })

  document.querySelector('.colors .hex>div')?.addEventListener('input', e => {
    let inputValue = e.target.value;

    if (inputValue.startsWith('#'))
      e.target.value = inputValue.slice(1), inputValue = e.target.value;
    if (inputValue.length !== 6 || !/^[a-zA-Z0-9]{6}$/g.test(inputValue))
      return e.target.closest('.hex').classList.add('incorrect');

    e.target.closest('.hex').classList.remove('incorrect');
    jsonObject.color = inputValue.toString();
    buildEmbed();
  })

  if (onlyEmbed) document.querySelector('.side1')?.remove();

  document.querySelector('.top-btn.copy').addEventListener('click', e => {
    const mark = e.target.closest('.top-btn.copy').querySelector('.mark'),
        jsonData = stringify(json),
        next = () => {
          mark.classList.remove('hidden');
          mark.previousElementSibling.classList.add('hidden');

          setTimeout(() => {
            mark.classList.add('hidden');
            mark.previousElementSibling.classList.remove('hidden');
          }, 1500);
        }

    if (!navigator.clipboard?.writeText(jsonData).then(next).catch(err => console.log('Could not copy to clipboard: ' + err.message))) {
      const textarea = document.body.appendChild(document.createElement('textarea'));

      textarea.value = jsonData;
      textarea.select();
      textarea.setSelectionRange(0, 50000);
      document.execCommand('copy');
      document.body.removeChild(textarea);
      next();
    }
  });
});

Object.defineProperty(window, 'json', {
  // Formarts value properly into 'jsonObject'.
  configurable: true,
  set: val => {
    // Filter non-json keys and empty json keys.
    const onlyJson = [val]?.filter(j => j.toString() === '[object Object]' && 0 in Object.keys(j));

    jsonObject = val ? val : onlyJson?.length ? onlyJson : {}

    // PS. Don't manually assign anything to 'jsonObject', assign to 'json' instead.

    buildEmbed();
    buildGui();
  },

  get: () => {
    const json = jsonObject;

    return json;
  },
});

console.__proto__.message = function (title, message, collapse = true) {
  collapse && this.groupCollapsed(title) || this.group(title);
  this.dir(message);
  this.groupEnd();
}
