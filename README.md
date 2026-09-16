# Supplychain Graph

Supplychain Graph is a Forge application for modelling and coordinating the
collaboration around an Epic across supplier and consumer tenants.

> **Status:** early implementation. The initial work establishes the local
developer loop and the pure collaboration contract before the collaboration
features are added to the Jira-facing panel.

## Verify the project

```sh
npm install
npm run check
```

`check` formats, lints, type-checks, validates the Forge manifest, and runs the
project-owned test suite.

## Project map

- [`specs/`](specs/) contains the product and architecture decisions.
- [`src/`](src/) contains the application code, including the minimal Jira panel
  that anchors the Forge app while the collaboration core is built.
- [`test/`](test/) contains project verification.
- [`vendor/`](vendor/) contains reference implementations. It is intentionally
  excluded from this app's build, lint, and test loop.

For the contributor workflow and Forge environment operations, see
[DEVELOPMENT.md](DEVELOPMENT.md). Contribution expectations are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
