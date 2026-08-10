# Coding principles

All implementation work in this codebase is done by AI. These four behaviors are the
ones that most directly reduce a model's cost-per-edit — they are infrastructure, not
style. Follow them when writing code; cite them when a review finds real structural
damage.

Everything else — naming, function size, comment discipline, test hygiene — you already
do natively and does not need to be written down here.

## Searchability

One term per concept. If the same idea appears under three names, grep returns three
different sets and the next model blends them.

- **Comply:** "user identifier" is `userId` everywhere — never also `uid`, `userID`, or `user_id`.
- **Violate:** `fetchUser` and `getUser` for the same operation; inventing a new term for an existing concept.

## Locality

A feature is one-hop discoverable: from a single grep on a meaningful term, or from
reading one file's imports, you can reach every file the feature touches.

- **Comply:** an auth flow lives in a few files reachable from one `auth/` directory or one import line.
- **Violate:** a feature you can only understand by reading interface A, then implementation B, then registry C, then config D.

"One hop" is the invariant, not "one or two files" — plenty of features legitimately
span more. The test is whether the tree reveals the feature, not the file count.

## Explicit over implicit

No metaprogramming, dispatch by string lookup, monkey-patching, or auto-registration.
The reader reads what runs.

- **Comply:** functions called by name; tools listed in an explicit array; routes declared in one file.
- **Violate:** decorators that scan the filesystem and auto-wire handlers; imports that mutate global state as a side effect.

If answering "what runs when X happens?" means reading framework internals, this is
what broke.

## One obvious pattern per job

For any given job there is one obvious way to do it here. Competing ways invite a model
to find three examples and blend them into a fourth that exists nowhere.

- **Comply:** CLI helpers in `bin/` are bash, except where the job needs a runtime bash cannot supply (a browser, an HTTP server), and they share one option-parsing shape. Resolvers in `lib/resolvers/` are flat markdown. Skill templates use one placeholder syntax.
- **Violate:** two ways to read project config coexisting; half the helpers bash and half TypeScript with no rule for which.

A change that introduces a second pattern for a solved job should either migrate the
old one or justify why this is genuinely a different job.
