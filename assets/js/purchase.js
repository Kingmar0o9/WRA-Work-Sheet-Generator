/* The kit request form (purchase/index.html): checks the answers and sends them to the server.
   It lives in its own file so the page can tell browsers to run no script written into the page itself.
   What a visitor types is only ever put on the page as plain text (textContent), never as HTML. */
(function () {
  var form = document.getElementById('buy-form');
  var endpoint = document.querySelector('meta[name="purchase-endpoint"]').content;
  var send = document.getElementById('send');
  var formError = document.getElementById('form-error');
  var sets = document.getElementById('sets');

  // the − and + buttons beside the number of sets
  Array.prototype.forEach.call(document.querySelectorAll('[data-step]'), function (b) {
    b.addEventListener('click', function () {
      var n = parseInt(sets.value, 10) || 0;
      sets.value = Math.min(1000, Math.max(1, n + Number(b.getAttribute('data-step'))));
      check('sets');
    });
  });

  var rules = {
    sets: function (v) { var n = Number(v); return n >= 1 && n <= 1000 && Math.floor(n) === n ? '' : 'Enter a whole number of sets, 1 or more.'; },
    school: function (v) { return v.trim().length >= 2 ? '' : 'Enter the name of your school.'; },
    // the same test the server uses: only the characters real addresses are made of
    email: function (v) { v = v.trim(); return v.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(v) ? '' : 'Enter an email address so I can reply, like name@school.org.'; }
  };
  function check(id) {
    var el = document.getElementById(id), msg = rules[id](el.value);
    document.getElementById(id + '-err').textContent = msg;
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  }
  Object.keys(rules).forEach(function (id) {
    document.getElementById(id).addEventListener('blur', function () { if (this.value) check(id); });
  });

  function row(label, value) {
    var d = document.createElement('div'), t = document.createElement('dt'), v = document.createElement('dd');
    t.textContent = label; v.textContent = value; d.appendChild(t); d.appendChild(v); return d;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    formError.textContent = '';
    var bad = Object.keys(rules).filter(function (id) { return !check(id); });
    if (bad.length) { document.getElementById(bad[0]).focus(); return; }
    var data = {
      sets: Number(sets.value),
      name: document.getElementById('name').value.trim(), // (form.name is the form's own name)
      school: form.school.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim(),
      website: form.website.value
    };
    var said = function (m) { var e = new Error(m); e.said = true; return e; };
    send.disabled = true; send.firstChild.textContent = 'Sending… ';
    fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.status === 200 && res.body.ok) {
          var recap = document.getElementById('recap');
          recap.appendChild(row('Sets', String(data.sets)));
          if (data.name) recap.appendChild(row('Name', data.name));
          recap.appendChild(row('School', data.school));
          recap.appendChild(row('Reply to', data.email));
          document.getElementById('ask').hidden = true;
          var thanks = document.getElementById('thanks');
          thanks.hidden = false;
          thanks.focus();
          thanks.scrollIntoView({ block: 'start' });
          return;
        }
        if (res.status === 429) throw said('That was sent a few times in a row. Wait a minute, then press Send again.');
        if (res.body && res.body.fields) { res.body.fields.forEach(function (f) { if (rules[f]) check(f); }); throw said('Please check the highlighted answers.'); }
        throw said('Something went wrong on the server, so your request wasn’t sent. Please press Send again in a minute.');
      })
      .catch(function (err) {
        // our own messages above; anything else means the server couldn't be reached at all
        formError.textContent = err && err.said ? err.message : 'The server couldn’t be reached, so your request wasn’t sent. Check your internet connection, then press Send again.';
        send.disabled = false; send.firstChild.textContent = 'Send ';
      });
  });
})();
