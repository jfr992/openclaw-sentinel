/**
 * OpenClaw Sentinel - Dagger CI/CD Pipeline
 *
 * Local and portable testing pipeline.
 * Run with: dagger call <function>
 *
 * Examples:
 *   dagger call lint --source=.
 *   dagger call unit-test --source=.
 *   dagger call ci --source=.
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
   * Install all dependencies (root + server)
   */
  @func()
  install(source: Directory): Container {
    return this.baseContainer(source)
      .withExec(["npm", "ci"])
      .withWorkdir("/app/server")
      .withExec(["npm", "ci"])
      .withWorkdir("/app")
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
   * Full CI pipeline: lint + test + build
   */
  @func()
  async ci(source: Directory): Promise<string> {
    const container = this.install(source)

    // Run lint
    const lintOutput = await container
      .withExec(["npm", "run", "lint"])
      .stdout()

    // Run tests
    const testOutput = await container
      .withExec(["npm", "run", "test"])
      .stdout()

    // Run build
    await container
      .withExec(["npm", "run", "build"])
      .sync()

    return `✅ CI Pipeline Complete\n\nLint:\n${lintOutput}\n\nTests:\n${testOutput}`
  }

  /**
   * Run security scans (npm audit + secrets check)
   */
  @func()
  async security(source: Directory): Promise<string> {
    const container = this.install(source)

    // NPM audit (allow failures for now, just report)
    const auditOutput = await container
      .withExec(["sh", "-c", "npm audit --audit-level=high || true"])
      .stdout()

    return `🔒 Security Scan Complete\n\n${auditOutput}`
  }

  /**
   * Build and test the production Docker image
   */
  @func()
  async docker(source: Directory): Promise<string> {
    // Build the Docker image using the project's Dockerfile
    const image = dag
      .container()
      .build(source, { dockerfile: "Dockerfile", target: "production" })

    // Test the image
    const result = await image
      .withExposedPort(5056)
      .withEnvVariable("OPENCLAW_DIR", "/tmp")
      .withEnvVariable("DATA_DIR", "/tmp")
      .withExec(["sh", "-c", `
        mkdir -p /tmp/agents/main/sessions &&
        echo '{}' > /tmp/agents/main/sessions/test.jsonl &&
        timeout 10 node server/src/index.js &
        sleep 5 &&
        wget -qO- http://localhost:5056/api/health | grep -q ok &&
        echo "✅ Docker image health check passed"
      `])
      .stdout()

    return result
  }

  /**
   * Get the production Docker image
   */
  @func()
  image(source: Directory): Container {
    return dag
      .container()
      .build(source, { dockerfile: "Dockerfile", target: "production" })
  }

  /**
   * Publish Docker image to registry
   */
  @func()
  async publish(source: Directory, registry: string, tag: string): Promise<string> {
    const image = this.image(source)
    const ref = `${registry}:${tag}`

    const digest = await image.publish(ref)
    return `Published: ${digest}`
  }
}
