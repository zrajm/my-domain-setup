/*-*- js-indent-level: 2 -*-*/
// Copyright 2025 by zrajm. Licenses: CC BY-SA (text), GPLv2 (code).

import { $ } from './elemental/elemental.mjs'

// Load Baremark modules (in order).
// FIXME: Strictly sequential loading of modules is inefficient. Fix?
importFiles(
  './baremark/addon/table.js',
  './baremark/addon/sup.js',
  './baremark/addon/autolink.js',
  './baremark/addon/id.js',                    // '[#…]' BEFORE toc & metadata
  './baremark/addon/meta.js',
  './baremark/addon/toc.js',
  pageMain)

/******************************************************************************/

function pageMain() {
  window.$ = $                                 // for use in browser console

  // Load stylesheet, remove old when new has loaded.
  const oldStyle = $('link[rel="stylesheet"]')
  $('head').append(
    $(`<link rel=stylesheet href=${import.meta.resolve('./main.css')}>`)
      .on('load', () => oldStyle.remove()))

  // Get & process markdown.
  const [textarea] = $('textarea')
  const htmlContent = baremark(textarea?.value ?? '')
    .replace(/\b(FIXME|TODO)\b/g, '<mark>$1</mark>')

  // Set some metadata defaults.
  const meta = baremark.meta                   // read from markdown
  meta.lang    ??=              'en-GB'        //   (UK locale has '1 May 2025'
  meta.title   ??=              '[NO TITLE]'   //     instead of 'May 1, 2025')
  meta.created ??= meta.date ?? ''
  meta.years   ??= [meta.created, meta.updated]
    .flatMap(x => /\b\d{4}\b/.exec(x) ?? [])
    .reduce((a, year) => a.includes(year) ? a : [...a, year], []).join('–')

  $('html')
    .attr({lang: meta.lang})
    .append('<input id=darkmode type=checkbox>')
    .addClass(/\bDEBUG\b/i.test(location.search) ? 'DEBUG' : '')

  $('head').append(htmlMeta(meta))             // get & add metadata to <head>

  // Replace <textarea> page content.
  textarea.outerHTML =
    htmlTitle(meta)
    + htmlContent
    + htmlFooter(meta)

  // Add 'target="_blank"' to all external links.
  $('a[href]:not([href^="#"],[href^="javascript:"])').attr({ target: '_blank' })

  insertOptionalBreakAfterSlash(document.body)

  // If table cell contains single link, make whole cell clickable.
  $('td:has(>a[href]:only-child),th:has(>a[href]:only-child)')
    .on('hover', () => { $(this).toggleClass('hover') })
    .on('click', e  => { $(e.currentTarget).children()[0].click() })

  // Return pixel height of 1rem * line-height in the root element.
  function getRhythm(e = ':root') {
    const $x = $('<p style="position:absolute;visibility:hidden">​</p>')
    $(e).append($x)
    return parseInt(getComputedStyle($x[0]).height, 10)
  }

  // Distance from the top of the document to baseline of this element. Will
  // only work on an element whose first child node is a text node, returns
  // null on failure.
  function getBaselineFromTop(e = ':root') {
    for (const n of e.childNodes) {            // look through nodes
      const type = n.nodeType
      if ((type === Node.TEXT_NODE             // is (non-empty) text node
           && n.nodeValue.trim() !== '') ||
          (type === Node.ELEMENT_NODE          //   or inline element
           && /^inline\b/.test(getComputedStyle(n).display))
          // FIXME: Ignore elements that are not in the flow (position: absolute, any other?)
          // FIXME: If an element exists, but in a non-inline element, traverse down it to find the first text node?
          // in flow: static, relative, sticky (ignored are: absolute, fixed)
         ) {
        const $c = $('<span style="display:inline-block;font-size:0;outline:4px solid green"></span>')
        $(e).prepend($c)
        return $c[0].getBoundingClientRect().top + scrollY
      }
    }
    return undefined
  }

  setTimeout(() => {
    const unit = getRhythm()
    let i = 0
    $('html.DEBUG').find('h1,h2,h3,h4,h5,h6,p,span').forEach(t => {
      if (!e.checkVisibility()) { return }
      //if (i >= 10) { return }

      const baseline = getBaselineFromTop(t)
      if (baseline !== undefined) {
        const deviance = Math.round(baseline / unit) * unit - baseline
        const opacity  = Math.abs(Math.round((deviance / unit) * 15)).toString(16)
        $(t).css({ background: `#000${opacity}` })
        if (deviance > 0) {
          console.log(">>", t, deviance, opacity)
          i += 1
        }
      }
    })
  }, 0)

  // If page has finished redraw, and is at top of page (= user hasn't scrolled
  // down), jump #hash fragment in URL (if there is one).
  setTimeout(() => {
    if (location.hash && scrollY === 0) {
      location.href = location.hash
    }
  }, 100)
}

// Load modules & run functions, in order.
//
// Args are names of modules to load (strings) or functions to run. Modules
// will be loaded sequentially (inefficient, but guaranteed order), and any
// function will be run instead of loading a function.
function importFiles(fileOrFunc, ...tail) {
  if (!fileOrFunc) { return }                  // no args = we're done
  if (typeof fileOrFunc === 'function') {      // function = run it
    fileOrFunc()
    return importFiles(...tail)
  }
  import(fileOrFunc).then(() => {              // string = load module
    return importFiles(...tail)
  })
}

// Traverse the DOM recursively, inserting '<wbr>' after '/' in text nodes if
// the word after '/' is five letters or longer (this limitation is mostly to
// not break 'him/her/it/them' combinations, which, if it occurs in the first
// cell of a table in TKD, looks really ugly since line breaks are forced
// there).
function insertOptionalBreakAfterSlash(e) {
  function walkTheDOM(e, func) {
    func(e)
    e = e.firstChild
    while (e) {
      walkTheDOM(e, func)
      e = e.nextSibling
    }
  }
  walkTheDOM(e, e => {
    if (e.nodeType === Node.TEXT_NODE) {
      const offset = e.data.search(/\/(?=\w{5,})/)
      if (offset >= 0) {
        const elem = e.splitText(offset + 1)
        e.parentNode.insertBefore(document.createElement('wbr'), elem)
        insertOptionalBreakAfterSlash(elem)  // process remaining text
      }
    }
  })
}

// Completely flatten all args, and join them using the first arg as a
// separator.
function flatjoin(sep, ...x) {
  return x.flat(Infinity).filter(x => x).join(sep)
}

// Returns `template` replacing the first `%`, unless `x` is falsey, in which
// case an empty string is returned. If `x` is array, it is flatjoin()ed before
// insertion (using the first element of the array as the separator).
function tmpl(template, x) {
  x = x?.constructor === Array ? flatjoin(...x) : x
  return x ? template.replace('%', x) : ''
}

// Return HTML for page <head>.
function htmlMeta({title, author, years, favicon}) {
  return flatjoin('\n', [
    '<meta name=viewport content=width=device-width,initial-scale=1.0,viewport-fit=cover>',
    tmpl('<link rel=icon href="%" sizes=any>', favicon),
    tmpl('<title>%</title>', [' ', [
      (title ?? '').replace(/<br>/g, ' '),
      tmpl('(%)', [' ', tmpl('© %', years), author])
    ]]),
  ])
}

// Return HTML for page title.
function htmlTitle({title, author, created, updated, lang, titleId}) {
  const quot = (x = '') => x.replace(/"/g, '&quot;')
  const textDate = date => !date ? ''
    : Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(new Date(date))
  return flatjoin('\n', [
    '<hgroup>',
    tmpl(`<h1${tmpl(' id="%"', quot(titleId))}>%</h1>`, title),
    tmpl('<h2>%</h2>', [' ', [
      tmpl('By %', author),
      tmpl('(<time>%</time>)', ['–', textDate(created, lang), textDate(updated, lang)])
    ]]),
    '</hgroup>',
  ])
}

// Return HTML for page <footer>.
function htmlFooter({author, years, license}) {
  return flatjoin('\n', [
    '<footer>',
     flatjoin('<br>', [
       tmpl('© %, Uppsala, Sweden', [' ', [
         tmpl('%', years),
         tmpl('by %', author)
       ]]),
       tmpl('License: %', license),
     ]),
    '</footer>',
  ])
}
//[eof]
