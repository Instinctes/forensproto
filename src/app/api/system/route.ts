 
import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Collect system information on macOS
    
    // 1. Get GPU Information via system_profiler
    const { stdout: gpuOut } = await execAsync("system_profiler SPDisplaysDataType");
    
    // Parse GPU info
    let gpuName = "Apple Silicon GPU";
    let gpuCores = "Unknown";
    let metalSupport = "Unknown";
    
    const chipMatch = gpuOut.match(/Chipset Model:\s*(.+)/);
    if (chipMatch) gpuName = chipMatch[1].trim();
    
    const coreMatch = gpuOut.match(/Total Number of Cores:\s*(\d+)/);
    if (coreMatch) gpuCores = coreMatch[1].trim();
    
    const metalMatch = gpuOut.match(/Metal Support:\s*(.+)/);
    if (metalMatch) metalSupport = metalMatch[1].trim();

    // 2. CPU Cores & Memory via sysctl
    const { stdout: cpuOut } = await execAsync("sysctl -n hw.ncpu");
    const { stdout: memOut } = await execAsync("sysctl -n hw.memsize");
    
    const cpuCores = parseInt(cpuOut.trim(), 10);
    const memBytes = parseInt(memOut.trim(), 10);
    const memGB = Math.round(memBytes / (1024 * 1024 * 1024));

    // 3. Hashcat version check
    let hashcatVersion = "Not installed";
    try {
      const { stdout: hashcatOut } = await execAsync("hashcat --version");
      hashcatVersion = hashcatOut.trim();
    } catch {
      // Ignored if hashcat not found
    }

    return NextResponse.json({
      success: true,
      hardware: {
        gpu: {
          name: gpuName,
          cores: gpuCores,
          metal: metalSupport,
        },
        system: {
          cpuCores,
          ramGB: memGB,
          os: "macOS",
        },
        software: {
          hashcat: hashcatVersion,
        }
      }
    });
  } catch (error: unknown) {
    console.error("System info error:", error);
    return NextResponse.json(
      { error: "Failed to read hardware metrics" },
      { status: 500 }
    );
  }
}
