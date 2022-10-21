// ==UserScript==
// @name        Fanboxed
// @version     1.1.0
// @homepageURL https://github.com/aznhe21/fanboxed
// @updateURL   https://raw.githubusercontent.com/aznhe21/fanboxed/master/fanboxed.user.js
// @downloadURL https://raw.githubusercontent.com/aznhe21/fanboxed/master/fanboxed.user.js
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.xmlHttpRequest
// @require     https://cdnjs.cloudflare.com/ajax/libs/jszip/3.9.1/jszip.min.js
// @include     https://*.fanbox.cc/*
// ==/UserScript==

// prefs

/**
 * @class
 */
class Prefs {
  filename_format = "[{year:04}-{month:02}-{day:02}] [{author}] {title}.zip";
  include_files = false;

  /**
   * @private
   * @param {Prefs} self
   * @returns {Array.<[keyof Prefs, Prefs[keyof Prefs]]>}
   */
  static _entries(self) {
    return /** @type {Array.<[keyof Prefs, Prefs[keyof Prefs]]>} */(Object.entries(self));
  }

  /**
   * @param {Prefs} self
   * @returns {Prefs}
   */
  static copy(self) {
    const ret = new Prefs();
    for (const [k, v] of Prefs._entries(self)) {
      /** @type {any} */(ret[k]) = v;
    }
    return ret;
  }

  /**
   * @returns {Promise.<Prefs>}
   */
  static async load() {
    // load values of matching type
    /** @type {Record.<string, unknown>} */
    let value = {};
    try {
      let storedValue = await GM.getValue("prefs");
      if (typeof storedValue === "string") {
        const storedObject = JSON.parse(storedValue);
        if (typeof storedObject === "object") {
          value = storedObject;
        }
      }
    } catch (_) {
    }

    const loading = new Prefs();
    for (const [k, def] of Prefs._entries(loading)) {
      if (k in value && typeof value[k] === typeof def) {
        /** @type any */(loading[k]) = value[k];
      }
    }
    return loading;
  }

  /**
   * @param {Prefs} self
   * @returns {Promise.<void>}
   */
  static async save(self) {
    // save changed values
    /** @type {Partial.<Prefs>} */
    const value = {};
    for (const [k, def] of Prefs._entries(new Prefs())) {
      if (k in self && typeof self[k] === typeof def && self[k] !== def) {
        /** @type {any} */(value[k]) = self[k];
      }
    }
    await GM.setValue("prefs", JSON.stringify(value));
  }
}

// locale

/**
 * @typedef {{
 *   "format.value_not_found": string,
 *   "format.invalid_spec": string,
 *   "api.failed": string,
 *   "api.error": string,
 *   "download.restricted": string,
 *   "download.failed": string,
 *   "download.error": string,
 *   "dl_button.start": string,
 *   "dl_button.pending": string,
 *   "dl_button.preparing": string,
 *   "dl_button.downloading": string,
 *   "dl_button.generating_zip": string,
 *   "prefs_dialog.title": string,
 *   "prefs_dialog.cancel": string,
 *   "prefs_dialog.ok": string,
 *   "prefs_dialog.filename_format": string,
 *   "prefs_dialog.filename_preview": string,
 *   "prefs_dialog.include_files": string,
 *   "prefs_dialog.preview_author": string,
 *   "prefs_dialog.preview_title": string,
 *   "prefs_dialog.preview_error": string,
 * }} Locale
 */

/** @type {Record.<string, Locale>} */
const LOCALES = {
  "ja": {
    "format.value_not_found": "'{name}'という名前の値はありません",
    "format.invalid_spec": "'{spec}'は形式化文字列として不正です",

    "api.failed": "API呼び出しに失敗しました",
    "api.error": "API呼び出しに失敗しました：{error}",

    "download.restricted": "記事の閲覧が制限されています",
    "download.failed": "'{url}'のダウンロードに失敗しました",
    "download.error": "ダウンロード中にエラーが発生しました：{error}",

    "dl_button.start": "ダウンロード",
    "dl_button.pending": "ダウンロード待機中（残り{pending}件）",
    "dl_button.preparing": "ダウンロード準備中...",
    "dl_button.downloading": "ダウンロード中... （{current} / {total}）",
    "dl_button.generating_zip": "ZIPを生成中...",

    "prefs_dialog.title": "Fanboxedの設定",
    "prefs_dialog.cancel": "キャンセル",
    "prefs_dialog.ok": "OK",
    "prefs_dialog.filename_format": "ファイル名の形式",
    "prefs_dialog.filename_preview": "ファイル名の例：{filename}",
    "prefs_dialog.include_files": "添付ファイルを含める",
    "prefs_dialog.preview_author": "作者名",
    "prefs_dialog.preview_title": "記事タイトル",
    "prefs_dialog.preview_error": "エラー：{error}",
  },
  "en": {
    "format.value_not_found": "No value named '{name}'",
    "format.invalid_spec": "Invalid format '{spec}'",

    "api.failed": "Failed to call an API",
    "api.error": "Failed to call an API: {error}",

    "download.restricted": "The post is restricted",
    "download.failed": "Failed to download '{url}'",
    "download.error": "Error occured during download: {error}",

    "dl_button.start": "Download",
    "dl_button.pending": "Pending downloads ({pending} remaining)",
    "dl_button.preparing": "Preparing to download...",
    "dl_button.downloading": "Downloading... ({current} / {total})",
    "dl_button.generating_zip": "Generating ZIP...",

    "prefs_dialog.title": "Fanboxed Preferences",
    "prefs_dialog.cancel": "Cancel",
    "prefs_dialog.ok": "OK",
    "prefs_dialog.filename_format": "File Name Format",
    "prefs_dialog.filename_preview": "Example File Name: {filename}",
    "prefs_dialog.include_files": "Include attachment files",
    "prefs_dialog.preview_author": "Author",
    "prefs_dialog.preview_title": "Post Title",
    "prefs_dialog.preview_error": "Error: {error}",
  },
};

/**
 * @type {Locale|undefined}
 */
let locale;

/**
 * @param {keyof Locale} key
 * @param {Record.<string, Object>} [obj]
 */
function localize(key, obj) {
  if (!locale) {
    let lang = navigator.language;
    if (!(lang in LOCALES)) {
      // en-US -> en
      lang = lang.replace(/-.*$/, "");
    }
    if (!(lang in LOCALES)) {
      lang = "en";
    }
    if (!(lang in LOCALES)) {
      throw new Error(`Unexpected error: invalid language: ${navigator.language}`);
    }
    locale = LOCALES[lang];
  }
  if (!(key in locale)) {
    throw new Error(`Unexpected error: not a localized message: ${key}`);
  }
  return obj ? easyFormat(locale[key], obj) : locale[key];
}

// utils

/**
 * @param {number} ms
 * @returns {Promise.<void>}
 */
function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {string} fmt
 * @param {Record.<string, any>} obj
 * @returns {string}
 */
function easyFormat(fmt, obj) {
  return fmt.replace(
    /{([^:}]+)(?::([^}]+))?}/g,
    /**
     * @param {string} name
     * @param {string} [spec]
     */
    (_, name, spec) => {
      if (!(name in obj)) {
        throw new Error(localize("format.value_not_found", { name }));
      }

      const v = obj[name];
      if (spec === undefined) {
        return v;
      }

      if (!/^0\d+$/.test(spec)) {
        throw new Error(localize("format.invalid_spec", { spec }));
      }

      const n = Number.parseInt(spec, 10);
      return v.toString().padStart(n, "0");
    },
  );
}

/**
 * @param {string} s
 * @returns {string}
 */
function extractExt(s) {
  return s.replace(/^.*\.(\w+)$/, "$1");
}

/**
 * @type {HTMLStyleElement|undefined}
 */
let style;
/**
 * @param {string} css
 */
function addStyle(css) {
  if (!style) {
    const head = document.querySelector("head");
    if (!head) {
      return;
    }

    style = document.createElement("style");
    head.append(style);
  }
  style.append(css + "\n");
}

/**
 * @param {string} url
 * @param {Object} options
 * @param {() => string} errorMessage
 * @returns {Promise.<any>}
 */
function request(url, options, errorMessage) {
  return new Promise((resolve, reject) => {
    GM.xmlHttpRequest({
      method: "GET",
      url,
      ...options,
      onload(res) {
        resolve(res.response);
      },
      onerror() {
        reject(new Error(errorMessage()));
      },
    });
  });
}

/**
 * @param {string} url
 * @returns {Promise.<ArrayBuffer>}
 */
async function download(url) {
  /** @type {ArrayBuffer} */
  return await request(
    url,
    {
      responseType: "arraybuffer",
    },
    () => localize("download.failed", { url }),
  );
}

// downloader

/**
 * @typedef {Object} DownloadObserver
 * @property {boolean} isAlive
 * @property {(postId: number|null) => void} onProgress
 */

const DownloadManager = new class {
  constructor() {
    /** @type {Prefs} */
    this.prefs = new Prefs();

    /**
     * @readonly
     * @type {number[]}
     */
    this.queue = [];
    /**
     * @readonly
     * @type {Array.<DownloadObserver>}
     */
    this.observers = [];
    /** @type {{ done: number; total: number; }} */
    this.currentStatus = { done: 0, total: 0 };
  }

  /**
   * @param {DownloadObserver} observer
   */
  subscribe(observer) {
    this.observers.push(observer);
  }

  /**
   * @param {number} postId
   */
  download(postId) {
    if (this.queue.indexOf(postId) >= 0) {
      return;
    }

    this.queue.push(postId);
    if (this.queue.length === 1) {
      // ignore returned Promise
      this._downloadTask();
    }

    this._notifyProgress(null);
  }

  // private

  /**
   * @private
   * @param {BeforeUnloadEvent} e
   */
  _beforeUnload(e) {
    e.preventDefault();
    return e.returnValue = "";
  }

  /**
   * @private
   * @param {number|null} postId
   */
  _notifyProgress(postId) {
    for (let i = 0; i < this.observers.length;) {
      const ob = this.observers[i];
      if (!ob.isAlive) {
        this.observers.splice(i, 1);
        continue;
      }

      try {
        ob.onProgress(postId);
      } catch (e) {
      }
      i++;
    }
  }

  /**
   * @private
   * @param {string} message
   */
  _reportError(message) {
    // do not block following downloads
    setTimeout(() => alert(message), 0);
  }

  /**
   * @private
   * @returns {Promise.<void>}
   */
  async _downloadTask() {
    window.addEventListener("beforeunload", this._beforeUnload);

    while (this.queue.length > 0) {
      try {
        await this._downloadPost(this.queue[0]);
      } catch (e) {
        this._reportError(e instanceof Error ? e.message : String(e));
      }

      this.queue.shift();
      this._notifyProgress(null);
    }

    window.removeEventListener("beforeunload", this._beforeUnload);
  }

  /**
   * @typedef {object} FanboxPostInfo
   * @property {string} author
   * @property {string} title

   * @property {number} year
   * @property {number} month
   * @property {number} day
   * @property {number} hour
   * @property {number} minute

   * @property {string|null} cover
   * @property {string} description
   * @property {string[]} images
   */

  /**
   * @param {number} postId
   * @returns {Promise.<FanboxPostInfo>} info a
   */
  async requestInfo(postId) {
    /**
     * @type {Post}
     */
    const res = await request(
      `https://api.fanbox.cc/post.info?postId=${postId}`,
      {
        headers: {
          Origin: "https://www.fanbox.cc",
        },
        responseType: "json",
      },
      () => localize("api.failed"),
    );
    if ("error" in res) {
      throw new Error(localize("api.error", { error: res.error }));
    }

    const raw = res.body;
    if (!raw) {
      throw new Error(localize("api.failed"));
    }

    if (raw.isRestricted || !raw.body) {
      throw new Error(localize("download.restricted"));
    }

    let description = "";
    /** @type {string[]} */
    let images = [];
    switch (raw.type) {
      case "image":
        description = raw.body.text;
        if (raw.body.images) {
          images = raw.body.images.map(i => i.originalUrl);
        }
        break;

      case "file":
        description = raw.body.text;
        if (this.prefs.include_files && raw.body.files) {
          images = raw.body.files.map(f => f.url);
        }
        break;

      case "article":
        for (const block of raw.body.blocks) {
          switch (block.type) {
            case "header":
              description += "\n" + block.text + "\n";
              break;

            case "p":
              description += block.text + "\n";
              break;

            case "image":
              images.push(raw.body.imageMap[block.imageId].originalUrl);
              break;

            case "file":
              if (this.prefs.include_files) {
                images.push(raw.body.fileMap[block.fileId].url);
              }
              break;
          }
        }

        description = description.trim().replace(/\n{3,}/g, "\n\n");
        break;
    }

    const date = new Date(raw.publishedDatetime);
    return {
      author: raw.user.name,
      title: raw.title,

      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),

      cover: raw.coverImageUrl,
      description,
      images,
    };
  }

  /**
   * @private
   * @param {number} postId
   * @returns {Promise.<void>}
   */
  async _downloadPost(postId) {
    this.currentStatus = { done: 0, total: Infinity };

    const info = await this.requestInfo(postId);
    this.currentStatus.total = info.images.length;
    if (info.cover) {
      this.currentStatus.total++;
    }
    this._notifyProgress(postId);

    /** @type {Blob} */
    let bin;
    try {
      const zip = new JSZip();

      // add a description file
      if (info.description) {
        zip.file("description.txt", info.description);
      }

      // download a cover image
      if (info.cover) {
        const blob = await download(info.cover);

        const name = `cover.${extractExt(info.cover)}`;
        zip.file(name, blob);

        this.currentStatus.done++;
        this._notifyProgress(postId);
      }

      // download content images
      for (let i = 0; i < info.images.length; i++) {
        const url = info.images[i];
        const blob = await download(url);

        const padded = (i + 1).toString().padStart(3, "0");
        const name = `page_${padded}.${extractExt(url)}`;
        zip.file(name, blob);

        this.currentStatus.done++;
        this._notifyProgress(postId);
      }

      bin = await zip.generateAsync({ type: "blob" });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      throw new Error(localize("download.error", { error }));
    }

    // fire the download
    const dl = document.createElement("a");
    dl.href = URL.createObjectURL(bin);
    dl.download = easyFormat(this.prefs.filename_format, info);
    document.body.append(dl);
    dl.click();
    dl.remove();
  }
};

// ui

/**
 * @class
 * @implements {DownloadObserver}
 */
class DownloadButton {
  /**
   * @param {number} postId
   * @param {Element} insertAfter
   */
  constructor(postId, insertAfter) {
    /** @type {number} */
    this.postId = postId;

    /** @type {HTMLButtonElement} */
    this.button = document.createElement("button");
    this.button.addEventListener("click", e => {
      e.preventDefault();
      DownloadManager.download(this.postId);
    });
    insertAfter.after(this.button);

    DownloadManager.subscribe(this);
    this.updateText();
  }

  updateText() {
    const pending = DownloadManager.queue.findIndex(i => this.postId === i);
    switch (pending) {
      case -1:
        this.button.textContent = localize("dl_button.start");
        this.button.disabled = false;
        break;

      case 0: {
        const { done, total } = DownloadManager.currentStatus;
        this.button.textContent = total === Infinity
          ? localize("dl_button.preparing")
          : done < total
            ? localize("dl_button.downloading", { current: done + 1, total })
            : localize("dl_button.generating_zip");
        this.button.disabled = true;
        break;
      }

      default:
        this.button.textContent = localize("dl_button.pending", { pending });
        this.button.disabled = true;
        break;
    }
  }

  // DownloadObserver

  /**
   * @type {boolean}
   */
  get isAlive() {
    return document.contains(this.button);
  }

  /**
   * @param {number|null} postId
   */
  onProgress(postId) {
    if (this.postId === postId || postId === null) {
      this.updateText();
    }
  }
}

class PostDownloadButton extends DownloadButton {
  /**
   * @param {number} postId
   * @param {Element} insertAfter
   */
  constructor(postId, insertAfter) {
    super(postId, insertAfter);

    this.button.id = "fanboxed-download-button";
    this.button.classList.add("fanboxed-post-button");

    /** @type {HTMLButtonElement} */
    this.prefs = document.createElement("button");
    this.prefs.id = "fanboxed-prefs-button";
    this.prefs.classList.add("fanboxed-post-button");
    this.prefs.addEventListener("click", e => {
      e.preventDefault();
      new PrefsPanel(document.body, postId);
    });

    this.button.after(this.prefs);
  }
}

class ListDownloadButton extends DownloadButton {
  /**
   * @param {number} postId
   * @param {Element} insertAfter
   */
  constructor(postId, insertAfter) {
    super(postId, insertAfter);

    this.button.classList.add("fanboxed-button");
  }
}

class PrefsPanel {
  /**
   * @param {Element} parent
   * @param {?number} postId
   */
  constructor(parent, postId) {
    const today = new Date();
    /** @type {FanboxPostInfo} */
    this.previewInfo = {
      author: localize("prefs_dialog.preview_author"),
      title: localize("prefs_dialog.preview_title"),
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
      hour: 12,
      minute: 34,
      cover: null,
      description: "",
      images: [],
    };
    // use post info as a preview as much as possible
    const requestPostInfo = (postId !== null)
      ? DownloadManager.requestInfo(postId).then(info => {
        this.previewInfo = info;
        this._updatePreview("filename_format");
      })
      : Promise.resolve();

    /** @type {Prefs} */
    this.prefs = Prefs.copy(DownloadManager.prefs);

    /** @type {HTMLDialogElement} */
    this.dialog = document.createElement("dialog");
    this.dialog.id = "fanboxed-prefs-dialog";
    this.dialog.innerHTML = `
<h1>${localize("prefs_dialog.title")}</h1>

<main>
  <section>
    <label>
      ${localize("prefs_dialog.filename_format")}
      <input data-prefs="filename_format">
    </label>
    <div data-preview="filename_format"></div>
  </section>

  <section>
    <label>
      <input type="checkbox" data-prefs="include_files">
      ${localize("prefs_dialog.include_files")}
    </label>
  </section>
</main>

<footer>
  <button class="cancel fanboxed-button">
    ${localize("prefs_dialog.cancel")}
  </button>
  <button class="ok fanboxed-button">
    ${localize("prefs_dialog.ok")}
  </button>
</footer>
    `;

    /** @type {HTMLButtonElement} */(this.dialog.querySelector(".cancel")).addEventListener("click", () => {
      this.close(false);
    });
    /** @type {HTMLButtonElement} */(this.dialog.querySelector(".ok")).addEventListener("click", () => {
      this.close(true);
    });

    for (const e of this.dialog.querySelectorAll("[data-prefs]")) {
      const name = /** @type {keyof Prefs|null} */(e.getAttribute("data-prefs"));
      if (!name || !(name in this.prefs)) {
        continue;
      }

      if (e instanceof HTMLInputElement) {
        if (e.type === "checkbox") {
          e.checked = /** @type {boolean} */(this.prefs[name]);
        } else {
          e.value = /** @type {string} */(this.prefs[name]);
        }

        e.addEventListener("input", () => {
          const value = e.type === "checkbox" ? e.checked : e.value;
          this._updateValue(name, value);
        });
      }
      this._updatePreview(name);
    }

    // wait a bit to prevent momentary UI changes
    Promise.race([sleep(100), requestPostInfo]).then(() => {
      parent.append(this.dialog);
      this.dialog.showModal();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  }

  /**
   * @param {boolean} apply
   */
  close(apply) {
    if (apply) {
      // ignore returned Promise
      Prefs.save(this.prefs);
      DownloadManager.prefs = this.prefs;
    }

    this.dialog.open = false;
    this.dialog.remove();
  }

  /**
   * @private
   * @template {keyof Prefs} K
   * @param {K} name
   * @param {Prefs[K]} value
   */
  _updateValue(name, value) {
    if (typeof this.prefs[name] !== typeof value) {
      return;
    }

    this.prefs[name] = value;
    this._updatePreview(name);
  }

  /**
   * @private
   * @param {keyof Prefs} name
   */
  _updatePreview(name) {
    const preview = this.dialog.querySelector(`[data-preview="${name}"]`);
    if (!preview) {
      return;
    }

    const content = this._getPreviewContent(name);
    if (!content) {
      return;
    }
    preview.textContent = content;
  }

  /**
   * @private
   * @param {keyof Prefs} name
   * @returns {?string}
   */
  _getPreviewContent(name) {
    switch (name) {
      case "filename_format": {
        /** @type {string} */
        let filename;
        try {
          filename = easyFormat(this.prefs.filename_format, this.previewInfo);
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          filename = localize("prefs_dialog.preview_error", { error });
        }
        return localize("prefs_dialog.filename_preview", { filename });
      }
    }
    return null;
  }
}

// main

/**
 * @param {string} url
 * @returns {number|null}
 */
function extractPostId(url) {
  const m = url.match(/\/posts\/(\d+)/);
  return m ? Number.parseInt(m[1], 10) : null;
}

/**
 * @param {Element} likeButton
 */
function handlePostPage(likeButton) {
  if (document.querySelector("article a[href$='/plans']")) {
    return;
  }

  const postId = extractPostId(location.href);
  if (postId === null) {
    return;
  }

  new PostDownloadButton(postId, likeButton);
}

/**
 * @param {NodeListOf.<HTMLAnchorElement>} cards
 */
function handleListPage(cards) {
  for (const card of cards) {
    if (card.querySelector(".fanboxed-button")) {
      continue;
    }

    const likeButton = card.querySelector(":scope > div > div > div > button, :scope > div > div > button");
    if (!likeButton) {
      continue;
    }

    const postId = extractPostId(card.href);
    if (!postId) {
      continue;
    }

    new ListDownloadButton(postId, likeButton);
  }
}

addStyle(`
.fanboxed-button {
	line-height: inherit;
	width: fit-content;
	height: 24px;
	padding: 0px 8px;
	border: 1px solid #999999;
	border-radius: 12px;
	background-color: white;
	background-repeat: no-repeat;
	background-position: 8px center;
	color: #999999;
}

.fanboxed-post-button {
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 28px;
  font-size: 12px;
  font-weight: bold;
  color: #999999;
  padding: 0px 14px;
  margin-left: 6px;
  border-radius: 14px;
  border: 1px solid #999999;
  background-color: white;
}

#fanboxed-download-button {
  min-width: 100px;
}

#fanboxed-prefs-button::after {
  content: "";
  width: 16px;
  height: 16px;
  /* based on https://www.svgrepo.com/svg/231062/settings-gear */
  background: url("data:image/svg+xml,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22iso-8859-1%22%3F%3E%0D%3C%21--%20Generator%3A%20Adobe%20Illustrator%2019.0.0%2C%20SVG%20Export%20Plug-In%20.%20SVG%20Version%3A%206.00%20Build%200%29%20%20--%3E%0D%3Csvg%20version%3D%221.1%22%20id%3D%22Layer_1%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20xmlns%3Axlink%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxlink%22%20x%3D%220px%22%20y%3D%220px%22%0D%09%20viewBox%3D%220%200%20512%20512%22%20style%3D%22enable-background%3Anew%200%200%20512%20512%3B%22%20xml%3Aspace%3D%22preserve%22%3E%0D%3Cg%3E%0D%09%3Cg%20fill%3D%22%23999%22%3E%0D%09%09%3Cpath%20d%3D%22M495.304%2C205.913h-45.519c-4.73-18.267-11.996-35.493-21.382-51.291l33.961-33.961c6.487-6.492%2C6.516-17.095%2C0-23.611%0D%09%09%09L414.95%2C49.633c-6.521-6.521-17.093-6.521-23.613%2C0l-33.959%2C33.961c-15.797-9.385-33.024-16.649-51.291-21.382V16.696%0D%09%09%09C306.087%2C7.477%2C298.572%2C0%2C289.391%2C0h-66.783c-9.18%2C0-16.696%2C7.477-16.696%2C16.696v45.517c-18.265%2C4.73-35.493%2C11.992-51.291%2C21.379%0D%09%09%09l-33.959-33.959c-6.521-6.521-17.093-6.521-23.613%2C0L49.635%2C97.05c-6.521%2C6.52-6.52%2C17.089%2C0%2C23.611l33.961%2C33.961%0D%09%09%09c-9.385%2C15.799-16.651%2C33.024-21.382%2C51.291H16.696C7.515%2C205.913%2C0%2C213.39%2C0%2C222.609v66.783c0%2C9.214%2C7.482%2C16.693%2C16.696%2C16.693%0D%09%09%09h45.519c4.73%2C18.267%2C11.996%2C35.493%2C21.382%2C51.291l-33.961%2C33.961c-6.521%2C6.52-6.52%2C17.089%2C0%2C23.611l47.415%2C47.417%0D%09%09%09c6.527%2C6.527%2C17.084%2C6.525%2C23.613%2C0l33.959-33.959c15.797%2C9.387%2C33.026%2C16.647%2C51.291%2C21.379v45.519%0D%09%09%09c0%2C9.214%2C7.482%2C16.696%2C16.696%2C16.696h66.783c9.157%2C0%2C16.696-7.463%2C16.696-16.696v-45.519c18.265-4.73%2C35.493-11.992%2C51.291-21.379%0D%09%09%09l33.959%2C33.959c6.527%2C6.527%2C17.084%2C6.525%2C23.613%2C0l47.415-47.417c6.487-6.492%2C6.516-17.095%2C0-23.611l-33.961-33.961%0D%09%09%09c9.385-15.799%2C16.651-33.024%2C21.382-51.291h45.519c9.214%2C0%2C16.696-7.481%2C16.696-16.693v-66.783%0D%09%09%09C512%2C213.447%2C504.54%2C205.913%2C495.304%2C205.913z%20M256%2C339.476c-46.08-0.029-83.449-37.396-83.478-83.476%0D%09%09%09c0.029-46.082%2C37.398-83.449%2C83.478-83.478c46.08%2C0.029%2C83.449%2C37.396%2C83.478%2C83.478C339.449%2C302.08%2C302.08%2C339.448%2C256%2C339.476z%22%0D%09%09%09%2F%3E%0D%09%3C%2Fg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3Cg%3E%0D%3C%2Fg%3E%0D%3C%2Fsvg%3E%0D");
}

#fanboxed-prefs-dialog::backdrop {
  background: rgba(0, 0, 0, .6);
}

#fanboxed-prefs-dialog {
  display: flex;
  flex-direction: column;
  width: 600px;
  padding: 0 10px;
  border-radius: 14px;
  border: 3px solid #999999;
}

#fanboxed-prefs-dialog > main > section,
#fanboxed-prefs-dialog > footer {
  margin-bottom: 20px;
}

#fanboxed-prefs-dialog label {
  display: flex;
  height: 25px;
  line-height: 25px;
  cursor: pointer;
}

#fanboxed-prefs-dialog label > input {
  height: 25px;
  box-sizing: border-box;
}

#fanboxed-prefs-dialog label > input:not([type="checkbox"]) {
  flex: 1;
  margin-left: 10px;
}

#fanboxed-prefs-dialog input[type="checkbox"] {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 12px;
  margin: 5px 8px 0 0;
  background-color: #999999;
  cursor: pointer;
}

#fanboxed-prefs-dialog input[type="checkbox"]:checked {
  background-color: #0096FA;
}

#fanboxed-prefs-dialog input[type="checkbox"]::after {
  content: "";
  display: block;
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: white;
  transition: transform 0.1s ease-out 0s;
  will-change: transform;
}

#fanboxed-prefs-dialog input[type="checkbox"]:checked::after {
  transform: translateX(100%);
}

#fanboxed-prefs-dialog > footer {
  text-align: right;
}

#fanboxed-prefs-dialog > footer > button {
  width: 100px;
  height: 30px;
}
`);

Prefs.load().then(prefs => {
  DownloadManager.prefs = prefs;
}).finally(() => {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  const observer = new MutationObserver(() => {
    const likeButton = document.querySelector("#root > div > div > div > div > div > div > div > article + div > div > div > div > button");
    if (likeButton) {
      if (document.getElementById("fanboxed-download-button")) {
        return;
      }

      return handlePostPage(likeButton);
    }

    /** @type {NodeListOf.<HTMLAnchorElement>} */
    const cards = document.querySelectorAll(`
      #root > div > div > div > div > div > div > div > div > a,
      #root > div > div > div > div > div > div > div > a
    `);
    if (cards.length > 0) {
      return handleListPage(cards);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
});
