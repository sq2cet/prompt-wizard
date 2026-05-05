# Phase 8: Data — Store

> Type, retention, encryption, backup, constraint violations.

**Mode:** detailed

## Where does data live at rest?
> SQL DB, document DB, key-value store, files on disk, object storage, cache only — describe each.

On-device SQLite via a CoreData stack. No server.

## How long should data be kept?

Forever (until manually deleted) (`forever`)

## Does data need to be encrypted at rest?

Yes

## Is the data important enough to back up?

No — re-derivable (`none`)
