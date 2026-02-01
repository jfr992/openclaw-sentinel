/**
 * Cangrejo Monitor - Dagger CI/CD Pipeline
 *
 * Local and portable testing pipeline for cangrejo-monitor.
 * Run with: dagger call <function>
 */
import { dag, Container, Directory, object, func } from "@dagger.io/dagger"

@object()
export class CangrejoMonitor {
  /**
   * Get a Node.js container with the project source mounted
   */
  private baseContainer(source: Directory): Container {
    return dag
      .container()
      .from("node:22-alpine")
      .withMountedDirectory("/app", source)
      .withWorkdir("/app")
  }

  /**
   * Install dependencies and return the container
   */
  @func()
  install(source: Directory): Container {
    return this.baseContainer(source)
      .withExec(["npm", "ci"])
  }

  /**
   * Run ESLint on the codebase
   */
  @func()
  async lint(source: Directory): Promise<string> {
    return this.install(source)
      .withEnvVariable("NODE_OPTIONS", "--max-old-space-size=4096")
      .withExec(["npm", "run", "lint"])
      .stdout()
  }

  /**
   * Run Vitest unit tests
   */
  @func()
  async unitTest(source: Directory): Promise<string> {
    return this.install(source)
      .withExec(["npm", "run", "test"])
      .stdout()
  }

  /**
   * Build the frontend for production
   */
  @func()
  build(source: Directory): Directory {
    return this.install(source)
      .withExec(["npm", "run", "build"])
      .directory("/app/dist")
  }

  /**
   * Run unit tests and return the container (for chaining)
   */
  @func()
  test(source: Directory): Container {
    return this.install(source)
      .withExec(["npm", "run", "test"])
  }

  /**
   * Full CI pipeline: test + build (lint skipped - too heavy for container)
   */
  @func()
  async ci(source: Directory): Promise<string> {
    const container = this.install(source)

    // Run tests
    const testOutput = await container
      .withExec(["npm", "run", "test"])
      .stdout()

    // Run build
    await container
      .withExec(["npm", "run", "build"])
      .sync()

    return `✅ CI Pipeline Complete\n\nTest Output:\n${testOutput}`
  }

  /**
   * Run the server and verify API endpoints respond
   */
  @func()
  async e2e(source: Directory): Promise<string> {
    // Start server in background, wait, then test endpoints
    const result = await this.install(source)
      .withExposedPort(5055)
      .withExec([
        "sh", "-c",
        `node server.js &
         sleep 3 &&
         curl -sf http://localhost:5055/api/health || exit 1 &&
         curl -sf http://localhost:5055/api/usage || exit 1 &&
         curl -sf http://localhost:5055/api/performance/summary || exit 1 &&
         echo "✅ All API endpoints responding"`
      ])
      .stdout()

    return result
  }

  /**
   * Get the production Docker image
   */
  @func()
  image(source: Directory): Container {
    // Build frontend first
    const dist = this.build(source)

    return dag
      .container()
      .from("node:22-alpine")
      .withWorkdir("/app")
      .withMountedDirectory("/app", source)
      .withExec(["npm", "ci", "--only=production"])
      .withMountedDirectory("/app/dist", dist)
      .withExposedPort(5055)
      .withEntrypoint(["node", "server.js"])
  }
}
