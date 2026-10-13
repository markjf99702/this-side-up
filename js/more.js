// Everything else: the move's name, the rooms, the list on another phone, NFC stickers, and starting over.
import { store } from './store.js';
import { app, esc, on, go, toast, icon, sheet, plural, copy, framed } from './ui.js';
import * as M from './model.js';
import { numberPrefix, base } from './payload.js';
import { sendSheet, backup, loadFile, csv } from './share.js';
import { badge } from './app.js';

export function more() {
  if (!store.list) { store.list = M.newList(); store.save(); }
  const list = store.list;
  const n = M.live(list).length;
  const tag = numberPrefix(base());
  app.innerHTML = `
    <div class="narrow more">
      <div class="screen-head"><div><p class="kicker kraft">More</p><h1>The move</h1></div></div>
      <section class="card">
        <label class="field"><span>What to call it <span class="hint">on backups and the list you send</span></span>
          <input class="input" id="moveName" maxlength="60" placeholder="Boston to Oakland" value="${esc(list.name)}" autocomplete="off">
        </label>
      </section>
      <a class="card row-link" href="#/rooms">${icon('rooms')}<span><b>Rooms</b><small>${plural(M.rooms(list, 'from').length, 'room')} you’re leaving, ${plural(M.rooms(list, 'to').length, 'room')} at the new place, with their colours and shapes</small></span>${icon('arrow', 'icon go')}</a>
      <a class="card row-link" href="#/first">${icon('star')}<span><b>The first night</b><small>The boxes to open first, and whether the kettle’s in one</small></span>${icon('arrow', 'icon go')}</a>

      <section class="card">
        <h2>On another phone</h2>
        <p>The list lives on this phone. Send it to another one as a link, or save a backup file, and open it there. When both phones have changed things, send it again: the two lists are merged box by box.</p>
        <div class="stack">
          <button class="btn wide" data-act="send"${n ? '' : ' disabled'}>${icon('share')}<span>Send the list as a link</span></button>
          ${framed() ? '' : `<button class="btn wide" data-act="backup"${n ? '' : ' disabled'}>${icon('file')}<span>Save a backup file<small>with the photos</small></span></button>`}
          <label class="btn wide">${icon('file')}<span>Open a backup file<small>from this phone or another</small></span><input type="file" id="fileIn" accept=".json,application/json" class="sr"></label>
          ${framed() ? '' : `<button class="btn wide" data-act="csv"${n ? '' : ' disabled'}>${icon('file')}<span>Spreadsheet (CSV)<small>for the movers or the insurance</small></span></button>`}
        </div>
      </section>

      <section class="card">
        <h2>NFC stickers</h2>
        <p>With <a href="https://junkdrawer.works/tag-along/">Tag Along</a> on an Android phone, set its link to this and its next number to your first box, then hold a sticker to each box. Tapping a sticker later opens that box here.</p>
        <div class="copy-row"><code class="link-text" id="tagLink">${esc(tag)}</code><button class="btn small" data-act="copytag">Copy</button></div>
      </section>

      <section class="card">
        <h2>Start over</h2>
        <p>Clears every box and room from this phone. Save a backup first if you might want it back.</p>
        <button class="btn danger" data-act="clear">${icon('trash')} Clear this phone</button>
      </section>
      <p class="hint center kraft">No account and nothing sent anywhere: the list stays in this browser. Pages work with no Wi-Fi once they’ve been opened.</p>
    </div>`;

  on({
    change(e) {
      if (e.target.id === 'moveName') {
        list.name = e.target.value.replace(/\s+/g, ' ').trim().slice(0, 60);
        store.save();
        toast('Saved');
      }
      if (e.target.id === 'fileIn' && e.target.files?.length) {
        const f = e.target.files[0];
        e.target.value = '';
        loadFile(f);
      }
    },
    click(e) {
      const t = e.target.closest('button');
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'send') sendSheet();
      if (act === 'backup') backup();
      if (act === 'csv') csv();
      if (act === 'copytag') copy(tag, document.getElementById('tagLink'), 'Copied');
      if (act === 'clear') {
        sheet(`
          <h2>Clear this phone?</h2>
          <p>${plural(n, 'box', 'boxes')} and their photos go. Labels already on boxes still show what’s in them when a phone reads them.</p>
          <div class="row"><button class="btn" data-close>Keep them</button><button class="btn primary" id="sheetGo">Clear everything</button></div>`,
        (body, close) => {
          body.querySelector('#sheetGo').onclick = async () => {
            close();
            const { photos } = await import('./store.js');
            for (const id of await photos.keys()) await photos.remove(id);
            store.list = null;
            store.save();
            badge();
            go('/', true);
            toast('Cleared');
          };
        });
      }
    },
  });
}
