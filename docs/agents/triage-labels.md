# Triage labels

The skills speak in terms of five canonical triage roles. In Lister they're values of a `Status:` line on a task in
`TASKS.md` (see `issue-tracker.md`).

| Label in mattpocock/skills | Label in our tracker | Meaning                                         |
| -------------------------- | -------------------- | ----------------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this task          |
| `needs-info`               | `needs-info`         | Waiting on the user for more information        |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent         |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation                   |
| `wontfix`                  | `wontfix`            | Won't be done (remove the task, note in design) |

A task with no `Status:` line is `ready-for-agent`. When a skill mentions a role, use the string from this table.
Edit the right-hand column to change the vocabulary.
