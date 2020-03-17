(async () => {
const Promise = require('bluebird');
const oada = require('@oada/oada-cache');
const config = require('../config');
let domain = config.get('domain');
const token = config.get('token');
if (!domain.match(/^https/)) domain = 'https://'+domain;

const con = await oada.connect({
  domain, token, cache: false
});


// Returns _id of new resource
async function makeResource(type,data) {
  data = data || {};
  console.log('Posting to create a new resource....');
  const r = await con.post({
    path: '/resources',
    data,
    headers: { 'content-type': type },
  });
  return r.headers['content-location'].slice(1); // get rid of leading slash
}

console.log('Deleting pre-existing vdocs if they exist');
try { await con.delete({ path: `/bookmarks/trellisfw/documents/mainvdoc` }) }
catch (e) { console.log('Could not delete pre-existing mainvdoc, it probably did not exist.') }
try { await con.delete({ path: `/bookmarks/trellisfw/documents/maskvdoc` }) }
catch (e) { console.log('Could not delete pre-existing maskvdoc, it probably did not exist.') }

console.log('Creating resources into a vdoc....');
const vdoc = await Promise.props({
  pdf: { _id: await makeResource('application/json') },
  audits: Promise.props({
    abc: Promise.props({ _id: makeResource('application/vnd.trellisfw.audit.generic.1+json')}),
    def: Promise.props({ _id: makeResource('application/vnd.trellisfw.audit.generic.1+json')}),
  }),
  cois: Promise.props({
    abc: Promise.props({ _id: makeResource('application/vnd.trellisfw.coi.generic.1+json')}),
    def: Promise.props({ _id: makeResource('application/vnd.trellisfw.coi.generic.1+json')}),
  }),
  masks: Promise.props({
    abc: Promise.props({ _id: await makeResource('application/vnd.trellisfw.coi.generic.1+json')}),
    def: Promise.props({ _id: await makeResource('application/vnd.trellisfw.coi.generic.1+json')}),
  }),
});
console.log('Creating main vdoc: ', vdoc);
vdoc._id = await makeResource('application/vnd.trellisfw.vdoc.1+json', vdoc);

console.log('Creating a masked vdoc (with internal unmask link) to test that circle is not made');
const mask = {
  unmask: { _id: vdoc._id },
};
mask._id = await makeResource('application/vnd.trellisfw.vdoc.1+json', mask);


console.log('putting link to new mask in parent vdoc');
await con.put({
  path: `/${vdoc._id}/masks/circle`,
  data: { _id: mask._id },
  headers: { 'content-type': 'application/vnd.trellisfw.vdoc.1+json' },
});

console.log('Linking into /bookmarks/documents');
await con.put({
  path: `/bookmarks/trellisfw/documents`,
  data: {
    mainvdoc: { _id: vdoc._id },
    maskvdoc: { _id: mask._id },
  },
  tree: {
    bookmarks: {
      _type: 'application/vnd.oada.bookmarks.1+json',
      trellisfw: {
        _type: 'application/vnd.trellisfw.1+json',
        documents: {
          _type: 'application/vnd.trellisfw.documents.1+json',
        }
      }
    }
  },
});

console.log('Posting mainvdoc job to oada-jobs queue');
await con.post({
  path: `/bookmarks/services/oada-ensure/jobs`,
  data: { _id: vdoc._id },
  headers: { 'content-type': 'application/vnd.oada.job.1+json' },
});

console.log('Posting maskvdoc job to oada-jobs queue');
await con.post({
  path: `/bookmarks/services/oada-ensure/jobs`,
  data: { _id: mask._id },
  headers: { 'content-type': 'application/vnd.oada.job.1+json' },
});

})()
