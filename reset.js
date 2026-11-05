'use strict';
(function () {
  // Защита от встраивания в чужие сайты (GitHub Pages не даёт задать frame-ancestors).
  if (window.top !== window.self) { return; }

  var SUPABASE_URL = 'https://umgvbcmxbevbmyzhdsmr.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_SAVkgoyBl3yTAJMEuvgKCQ_FGKnqbu3'; // публичный ключ, тот же, что в CRM

  var app = document.getElementById('app');
  var msg = document.getElementById('msg');
  var form = document.getElementById('form');
  var pw1 = document.getElementById('pw1');
  var pw2 = document.getElementById('pw2');
  var btn = document.getElementById('btn');

  function show(text, kind) { msg.textContent = text; msg.className = kind || ''; }

  // Читаем одноразовый код из части адреса после #, затем сразу убираем его из адреса и истории.
  var params = new URLSearchParams(window.location.hash.slice(1));
  var tokenHash = params.get('token_hash');
  var type = params.get('type') || 'recovery';
  var linkError = params.get('error_description') || params.get('error');
  if (window.location.hash || window.location.search) {
    history.replaceState(null, '', window.location.pathname);
  }
  params = null;
  app.hidden = false;

  if (linkError) { show('Ссылка недействительна или устарела. Запросите сброс пароля в WiseBase ещё раз.', 'error'); return; }
  if (!tokenHash || type !== 'recovery' || !/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) {
    show('Ссылка неполная или неверная. Откройте ссылку из последнего письма или запросите сброс ещё раз.', 'error');
    return;
  }
  form.hidden = false;

  var accessToken = null; // хранится только в памяти страницы
  var busy = false;

  function api(path, method, body, bearer) {
    var headers = { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' };
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    return fetch(SUPABASE_URL + '/auth/v1/' + path, {
      method: method, headers: headers, body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error'
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  }

  function errText(res) {
    var d = res.data || {};
    var code = d.error_code || d.code || '';
    if (code === 'weak_password') return 'Пароль слишком простой. Придумайте более сложный.';
    if (code === 'same_password') return 'Новый пароль должен отличаться от старого.';
    if (code === 'otp_expired' || res.status === 403) return 'Ссылка устарела или уже использована. Запросите сброс пароля ещё раз.';
    if (res.status === 429) return 'Слишком много попыток. Подождите и попробуйте снова.';
    return 'Не удалось сменить пароль. Попробуйте ещё раз или запросите новую ссылку.';
  }

  function finish() {
    accessToken = null; tokenHash = null;
    pw1.value = ''; pw2.value = '';
    form.hidden = true;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var p = pw1.value;
    if (p.length < 10) { show('Пароль должен быть не короче 10 символов.', 'error'); return; }
    if (p.length > 72) { show('Пароль должен быть не длиннее 72 символов.', 'error'); return; }
    if (p !== pw2.value) { show('Пароли не совпадают.', 'error'); return; }
    busy = true; btn.disabled = true; show('Меняем пароль…');

    var step = accessToken ? Promise.resolve({ ok: true }) :
      api('verify', 'POST', { type: 'recovery', token_hash: tokenHash }).then(function (res) {
        if (!res.ok || !res.data || typeof res.data.access_token !== 'string') { finish(); throw res; }
        accessToken = res.data.access_token; tokenHash = null;
        return res;
      });

    step.then(function () {
      return api('user', 'PUT', { password: p }, accessToken);
    }).then(function (res) {
      if (!res.ok) { throw res; }
      // Завершаем все сессии пользователя, включая сессию этой страницы.
      return api('logout?scope=global', 'POST', null, accessToken).catch(function () { return null; });
    }).then(function () {
      finish();
      show('Пароль изменён. Откройте WiseBase и войдите с новым паролем. Эту вкладку можно закрыть.', 'ok');
    }).catch(function (res) {
      show(errText(res || {}), 'error');
      if (!accessToken) { finish(); }
    }).then(function () { p = null; busy = false; btn.disabled = false; });
  });
})();
