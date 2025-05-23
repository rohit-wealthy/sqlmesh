import path from "path"
import { traceLog, traceVerbose } from "../common/log"
import { getInterpreterDetails } from "../common/python"
import { Result, err, isErr, ok } from "../functional/result"
import { getProjectRoot } from "../common/utilities"
import { execFile } from "child_process"
import { promisify } from "util"
import { isPythonModuleInstalled } from "../python"
import fs from "fs"
import { ErrorType } from "../errors"
import { isSignedIntoTobikoCloud } from "../../auth/auth"

export type sqlmesh_exec = {
  workspacePath: string;
  bin: string;
  env: Record<string, string | undefined>;
  args: string[];
};

/**
 * Returns true if the current project is a Tcloud project. To detect this we,
 * 1. Check if the project has a tcloud.yaml file in the project root. If it does, we assume it's a Tcloud project.
 * 2. Check if the project has tcloud installed in the Python environment.
 *
 * @returns A Result indicating whether tcloud is installed.
 */
export const isTcloudProject = async (): Promise<Result<boolean, string>> => {
  const projectRoot = await getProjectRoot()
  const tcloudYamlPath = path.join(projectRoot.uri.fsPath, "tcloud.yaml")
  if (fs.existsSync(tcloudYamlPath)) {
    return ok(true)
  }
  return isPythonModuleInstalled("tcloud")
}

/**
 * Get the tcloud executable for the current Python environment.
 *
 * @returns The tcloud executable for the current Python environment.
 */
export const get_tcloud_bin = async (): Promise<Result<string, string>> => {
  const interpreterDetails = await getInterpreterDetails()
  if (!interpreterDetails.path) {
    return err("No Python interpreter found")
  }
  const pythonPath = interpreterDetails.path[0]
  const binPath = path.join(path.dirname(pythonPath), "tcloud")
  return ok(binPath)
}

/**
 * Get the sqlmesh executable for the current workspace.
 *
 * @returns The sqlmesh executable for the current workspace.
 */
export const sqlmesh_exec = async (): Promise<Result<sqlmesh_exec, ErrorType>> => {
  const projectRoot = await getProjectRoot()
  const workspacePath = projectRoot.uri.fsPath
  const interpreterDetails = await getInterpreterDetails()
  traceLog(`Interpreter details: ${JSON.stringify(interpreterDetails)}`)
  if (interpreterDetails.path) {
    traceVerbose(
      `Using interpreter from Python extension: ${interpreterDetails.path.join(
        " "
      )}`
    )
  }
  if (interpreterDetails.isVirtualEnvironment) {
    traceLog("Using virtual environment")
    const isTcloudInstalled = await isTcloudProject()
    if (isErr(isTcloudInstalled)) {
      return err({
        type: "generic",
        message: isTcloudInstalled.error,
      }) 
    }
    if (isTcloudInstalled.value) {
      const tcloudBin = await get_tcloud_bin()
      if (isErr(tcloudBin)) {
        return err({
          type: "generic",
          message: tcloudBin.error,
        })
      }
      const isSignedIn = await isSignedIntoTobikoCloud()
      if (!isSignedIn) {
        return err({
          type: "not_signed_in",
        })
      }
      return ok({
        bin: `${tcloudBin.value} sqlmesh`,
        workspacePath,
        env: {
          PYTHONPATH: interpreterDetails.path?.[0],
          VIRTUAL_ENV: path.dirname(interpreterDetails.binPath!),
          PATH: interpreterDetails.binPath!,
        },
        args: [],
      })
    }
    const binPath = path.join(interpreterDetails.binPath!, "sqlmesh")
    traceLog(`Bin path: ${binPath}`)
    return ok({
      bin: binPath,
      workspacePath,
      env: {
        PYTHONPATH: interpreterDetails.path?.[0],
        VIRTUAL_ENV: path.dirname(interpreterDetails.binPath!),
        PATH: interpreterDetails.binPath!,
      },
      args: [],
    })
  } else {
    return ok({
      bin: "sqlmesh",
      workspacePath,
      env: {},
      args: [],
    })
  }
}

/**
 * Get the sqlmesh_lsp executable for the current workspace.
 *
 * @returns The sqlmesh_lsp executable for the current workspace.
 */
export const sqlmesh_lsp_exec = async (): Promise<
  Result<sqlmesh_exec, ErrorType>
> => {
  const projectRoot = await getProjectRoot()
  const workspacePath = projectRoot.uri.fsPath
  const interpreterDetails = await getInterpreterDetails()
  traceLog(`Interpreter details: ${JSON.stringify(interpreterDetails)}`)
  if (interpreterDetails.path) {
    traceVerbose(
      `Using interpreter from Python extension: ${interpreterDetails.path.join(
        " "
      )}`
    )
  }
  if (interpreterDetails.isVirtualEnvironment) {
    traceLog("Using virtual environment")
    const tcloudInstalled = await isTcloudProject()
    if (isErr(tcloudInstalled)) {
      return err({
        type: "generic",
        message: tcloudInstalled.error,
      })
    }
    if (tcloudInstalled.value) {
      traceLog("Tcloud installed, installing sqlmesh")
      const tcloudBin = await get_tcloud_bin()
      if (isErr(tcloudBin)) {
        return err({
          type: "generic",
          message: tcloudBin.error,
        })
      }
      const isSignedIn = await isSignedIntoTobikoCloud()
      if (!isSignedIn) {
        return err({
          type: "not_signed_in",
        })
      }
      const execFileAsync = promisify(execFile)
      await execFileAsync(tcloudBin.value, ["install_sqlmesh"], {
        cwd: workspacePath,
        env: {
          PYTHONPATH: interpreterDetails.path?.[0],
          VIRTUAL_ENV: path.dirname(interpreterDetails.binPath!),
          PATH: interpreterDetails.binPath!,
        },
      })
    }
    const binPath = path.join(interpreterDetails.binPath!, "sqlmesh_lsp")
    traceLog(`Bin path: ${binPath}`)
    return ok({
      bin: binPath,
      workspacePath,
      env: {
        PYTHONPATH: interpreterDetails.path?.[0],
        VIRTUAL_ENV: path.dirname(interpreterDetails.binPath!),
        PATH: path.join(path.dirname(interpreterDetails.binPath!), "bin"),
      },
      args: [],
    })
  } else {
    return ok({
      bin: "sqlmesh_lsp",
      workspacePath,
      env: {},
      args: [],
    })
  }
}
