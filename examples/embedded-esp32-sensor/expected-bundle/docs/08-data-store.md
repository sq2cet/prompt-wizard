# Phase 8: Data — Store

> Type, retention, encryption, backup, constraint violations.

**Mode:** detailed

## Where does data live at rest?
> SQL DB, document DB, key-value store, files on disk, object storage, cache only — describe each.

No on-device store; the receiving webhook is the durable record.

## How long should data be kept?

Ephemeral — discarded after processing (`ephemeral`)

## Does data need to be encrypted at rest?

No

## Is the data important enough to back up?

No — re-derivable (`none`)
