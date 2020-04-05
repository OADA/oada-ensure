# oada-ensure #

A microservice to ensure that things happen in other documents in response to document changes (i.e. re-indexing, copying, linking, etc.).  It currently uses oada-jobs as the means by which it gets its directions.

The only current task it performs is to create a link in any children linked from a virtual document 
at /bookmarks/trellisfw/documents back to the main virtual document parent.  It stores the link in the child at `_meta/vdoc`

## Installation
```bash
cd /path/to/your/oada-srvc-docker
cd services-available
git clone git@github.com:OADA/oada-ensure.git
cd ../services-enabled
ln -s ../services-available/oada-ensure .
```

## Overriding defaults for production
`z_tokens` docker-compose.yml entry:
```docker-compose
  oada-ensure:
    environment:
      - token=atokentouseinproduction
      - domain=https://your.oada.domain
```
