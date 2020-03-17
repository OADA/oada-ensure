import { readFileSync } from 'fs';
import Promise from 'bluebird';
import _ from 'lodash'; // Lazy, lodash isn't really needed anymore
import debug from 'debug';
import { JobQueue } from '@oada/oada-jobs';

import config from './config.js'

const error = debug('oada-ensure:error');
const warn = debug('oada-ensure:warn');
const info = debug('oada-ensure:info');
const trace = debug('oada-ensure:trace');

const TOKEN = config.get('token');
let DOMAIN = config.get('domain') || '';
if (!DOMAIN.match(/^http/)) DOMAIN = 'https://'+DOMAIN;

const KEYS_TO_IGNORE = { unmask: true, masks: true }; // these are vdocs that interlink, not things inside vdocs.

const service = new JobQueue('oada-ensure', jobCallback, {
  concurrency: 1,
  domain: DOMAIN,
  token: TOKEN
});

//----------------------------------------------------------
// Helpers to create all the Vdoc parent links:
async function createLinkInMeta(path, vdoc, con) {
  // ensure leading slash
  if (!path.match(/^\//)) path = `/${path}`;
  try {
    const r = await con.get({ path: `${path}/_meta` });
    const meta = _.cloneDeep(r.data);
    if (meta && meta.vdoc) {
      trace(`${path}/_meta/vdoc already exists, leaving it alone`);
      return;
    }
    trace(`${path}/_meta/vdoc: does not exist, creating it`);
    await con.put({
      path: `${path}/_meta/vdoc`,
      data: { _id: vdoc._id },
      headers: { 'content-type': vdoc._type || 'application/json' },
    });
    trace(`${path}/_meta/vdoc: successfully created link`);
  } catch(e) {
    error(`${path}/_meta/vdoc: failed to put link! error = `, e);
    throw new Error(`${path}/_meta/vdoc: failed to put link! error = `, e);
  }
}

async function recursiveAddVdocLinksToKeys(curobj, curpath, vdoc, con) {
  if (typeof curobj !== 'object') return; // nothing more to do
  // If curobj has an id, it's a link to something.  Note that _meta is ignored in the recursion below
  // For the top-leve, _id exists on the main vdoc so we have to ignore that case
  if (curobj._id && curobj._id !== vdoc._id) {
    return await createLinkInMeta(curpath, vdoc, con);
  }

  // If we get here, then we're guananteed that this thing is not a link
  // _.keys works for arrays and for objects
  return Promise.map(_.keys(curobj), async (key) => {
    if (key.match(/^_meta/)) return; // ignoring _meta because it has an _id but isn't a real link
    if (KEYS_TO_IGNORE[key]) return; // ignore unmask and masks
    if (typeof curobj[key] !== 'object') return; // strings and numbers can't be links and don't have children
    // Otherwise, array or object so re-call ourselves on each child key
    return await recursiveAddVdocLinksToKeys(curobj[key], `${curpath}/${key}`, vdoc, con);
  });
}

//-------------------------------------------------------
// Main job queue callback:
async function jobCallback(id, task, con) {
  info(`Processing vdoc resource ${id}`);
  const vdocpath = `/resources/${id}`;
  let vdoc = false;
  let vdocmeta = false;
  try {
    let r = await con.get({ path: vdocpath });
    vdoc = _.cloneDeep(r.data);
    // Get our own meta to make sure we don't mess with our own parent's vdoc link
    // (i.e. when recursing through the `unmask` key)
    r = await con.get({ path: `${vdocpath}/_meta` });
    vdocmeta = _.cloneDeep(r.data);
  } catch (e) {
    error(`Could not retrieve vdoc ${vdocpath} or it's _meta, err = %O`, e);
    throw new Error(`Could not retrieve vdoc ${vdocpath}`);
  }
  if (!vdoc) {
    warn(`WARNING: vdoc for ${vdocpath} was empty!`);
    return; // nothing to do, but not really an error
  }
  // save the _meta in the vdoc for recursiveAddVdocLinksToKeys
  vdoc._meta = vdocmeta;

  // Recurse through all keys
  // if any key has an _id, it is a link, so put ourselves at it's vdoc.
  // This recursion will handle top-level links in the vdoc as well as things like audits/*
  await recursiveAddVdocLinksToKeys(vdoc,vdocpath, vdoc, con);
  return { success: true };
}

(async () => {
  try {
    await service.start();
  } catch (e) {
    console.error(e);
  }
})();
