// 작은 DOM 도우미. h('p', { class: 'x', onclick: f }, '글자', child)

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  return el;
}

export function statusBox(title, paths = []) {
  return h(
    'div',
    { class: 'status' },
    h('strong', {}, title),
    paths.length ? h('ul', {}, paths.map((p) => h('li', {}, h('code', {}, 'data/' + p)))) : null,
  );
}
