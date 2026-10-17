using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;

namespace AgentsDesktop {
  public class Box { public double x, y, width, height; }
  public class Element {
    public string id, name, controlType, value;
    public bool enabled, password, focused;
    public Box bounds;
  }
  public class Window {
    public string windowId, processStartedAt, executable, title;
    public int processId;
    public bool foreground;
    public Box bounds;
    public Element[] elements;
  }
  public static class Native {
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mouse; [FieldOffset(0)] public KEYBDINPUT key; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION data; }
    delegate bool EnumWindowProc(IntPtr hwnd, IntPtr arg);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowProc callback, IntPtr arg);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, INPUT[] input, int size);
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll")] static extern bool SwitchDesktop(IntPtr desktop);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    static Native() {
      try { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); }
      catch (EntryPointNotFoundException) { SetProcessDPIAware(); }
    }
    static void NoHeldModifiers() {
      foreach (int key in new int[] {16,17,18,91,92}) if ((GetAsyncKeyState(key) & 0x8000)!=0) throw new Exception("Release held modifier keys before automated input.");
    }
    public static void CheckDesktop() {
      IntPtr desktop = OpenInputDesktop(0, false, 0x0100);
      if (desktop == IntPtr.Zero) throw new Exception("Interactive desktop unavailable or locked.");
      try { if (!SwitchDesktop(desktop) || GetForegroundWindow() == IntPtr.Zero) throw new Exception("Interactive desktop is locked or inaccessible."); }
      finally { CloseDesktop(desktop); }
    }
    static Process ProcessFor(IntPtr hwnd, string executable) {
      CheckDesktop();
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      if (pid == 0 || !IsWindowVisible(hwnd) || IsIconic(hwnd)) throw new Exception("Window is missing, minimized, or not visible.");
      Process process = Process.GetProcessById((int)pid);
      if (!String.Equals(process.MainModule.FileName, executable, StringComparison.OrdinalIgnoreCase)) throw new Exception("Window executable differs from authorized application.");
      if (process.SessionId != Process.GetCurrentProcess().SessionId) throw new Exception("Cross-session control is prohibited.");
      return process;
    }
    public static long FindWindow(string executable) {
      List<long> windows = new List<long>();
      EnumWindows(delegate(IntPtr hwnd, IntPtr arg) {
        try { using (Process p = ProcessFor(hwnd, executable)) { windows.Add(hwnd.ToInt64()); } } catch { }
        return true;
      }, IntPtr.Zero);
      if (windows.Count != 1) throw new Exception("Expected one visible authorized window; specify a windowId. Matching handles: " + String.Join(",", windows));
      return windows[0];
    }
    static Box Bounds(System.Windows.Rect r) { return new Box { x=r.X, y=r.Y, width=r.Width, height=r.Height }; }
    static bool Valid(Box r) { return !Double.IsInfinity(r.x) && !Double.IsNaN(r.x) && r.width > 0 && r.height > 0; }
    static string Id(AutomationElement e) { return String.Join(".", e.GetRuntimeId()); }
    static string Truncate(string s) { return s == null ? "" : s.Substring(0, Math.Min(2000, s.Length)); }
    static List<AutomationElement> Nodes(IntPtr hwnd) {
      // Bound traversal; stop at password controls rather than traversing their children.
      List<AutomationElement> result = new List<AutomationElement>();
      Queue<AutomationElement> queue = new Queue<AutomationElement>();
      queue.Enqueue(AutomationElement.FromHandle(hwnd));
      int visits = 0;
      while (queue.Count > 0 && visits++ < 200) {
        AutomationElement e = queue.Dequeue();
        result.Add(e);
        if (e.Current.IsPassword) continue;
        AutomationElement child = TreeWalker.ControlViewWalker.GetFirstChild(e);
        int siblings = 0;
        while (child != null && siblings++ < 200 && queue.Count < 200) {
          queue.Enqueue(child); child = TreeWalker.ControlViewWalker.GetNextSibling(child);
        }
        if (child != null) throw new Exception("UI Automation tree is too large for complete password masking.");
      }
      if (queue.Count > 0) throw new Exception("UI Automation tree exceeds the safe observation limit; capture refused.");
      return result;
    }
    static AutomationElement Target(IntPtr hwnd, string id) {
      foreach (AutomationElement e in Nodes(hwnd)) if (Id(e) == id) {
        if (e.Current.IsPassword || e.Current.IsOffscreen || !e.Current.IsEnabled) throw new Exception("Target is protected, disabled or offscreen.");
        uint pid; GetWindowThreadProcessId(hwnd, out pid);
        if (e.Current.ProcessId != (int)pid) throw new Exception("Target belongs to another process.");
        return e;
      }
      throw new Exception("Observed element is no longer available.");
    }
    public static Window Observe(long handle, string executable) {
      IntPtr hwnd = new IntPtr(handle);
      using (Process p = ProcessFor(hwnd, executable)) {
        RECT rect; if (!GetWindowRect(hwnd, out rect)) throw new Exception("Cannot read window bounds.");
        List<Element> elements = new List<Element>();
        foreach (AutomationElement e in Nodes(hwnd)) {
          if (e.Current.IsOffscreen || e.Current.ProcessId != p.Id) continue;
          Box b = Bounds(e.Current.BoundingRectangle); if (!Valid(b)) continue;
          bool secret = e.Current.IsPassword;
          string value = null; object pattern;
          if (!secret && e.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) value = Truncate(((ValuePattern)pattern).Current.Value);
          elements.Add(new Element { id=Id(e), name=secret ? "[protected]" : Truncate(e.Current.Name), controlType=e.Current.ControlType.ProgrammaticName, value=value, password=secret, enabled=e.Current.IsEnabled, focused=e.Current.HasKeyboardFocus, bounds=b });
        }
        return new Window { windowId=handle.ToString(), processId=p.Id, processStartedAt=p.StartTime.ToUniversalTime().ToString("o"), executable=p.MainModule.FileName, title=Truncate(AutomationElement.FromHandle(hwnd).Current.Name), foreground=GetForegroundWindow()==hwnd, bounds=new Box { x=rect.Left,y=rect.Top,width=rect.Right-rect.Left,height=rect.Bottom-rect.Top }, elements=elements.ToArray() };
      }
    }
    static void Foreground(IntPtr hwnd) { CheckDesktop(); if (GetForegroundWindow()!=hwnd) throw new Exception("Foreground changed. Input refused; observe again."); }
    static POINT Center(IntPtr hwnd, AutomationElement e) {
      System.Windows.Rect b=e.Current.BoundingRectangle;
      POINT point=new POINT { X=(int)(b.X+b.Width/2),Y=(int)(b.Y+b.Height/2) };
      RECT window; GetWindowRect(hwnd, out window);
      if (point.X<window.Left || point.X>=window.Right || point.Y<window.Top || point.Y>=window.Bottom) throw new Exception("Target is outside the authorized window.");
      if (GetAncestor(WindowFromPoint(point),2)!=hwnd) throw new Exception("Target is occluded by another window.");
      return point;
    }
    static INPUT Key(ushort vk, ushort scan, uint flags) { return new INPUT { type=1,data=new INPUTUNION { key=new KEYBDINPUT { vk=vk,scan=scan,flags=flags } } }; }
    static void Send(INPUT[] input) {
      NoHeldModifiers();
      if (SendInput((uint)input.Length,input,Marshal.SizeOf(typeof(INPUT)))!=input.Length) {
        // Best-effort release of only this batch's keys/buttons after a partial insertion.
        List<INPUT> release=new List<INPUT>();
        foreach (INPUT item in input) {
          if (item.type==1 && (item.data.key.flags & 2)==0) release.Add(Key(item.data.key.vk,item.data.key.scan,item.data.key.flags|2));
          if (item.type==0 && (item.data.mouse.dwFlags & 2)!=0) release.Add(new INPUT {type=0,data=new INPUTUNION {mouse=new MOUSEINPUT {dwFlags=4}}});
        }
        if (release.Count>0) SendInput((uint)release.Count,release.ToArray(),Marshal.SizeOf(typeof(INPUT)));
        throw new Exception("Input was partially or fully blocked. Inspect state before retrying.");
      }
    }
    public static void Act(long handle,string executable,string kind,string elementId,string text,string key) {
      IntPtr hwnd=new IntPtr(handle); using (Process p=ProcessFor(hwnd,executable)) { }
      if (kind=="focus") { if (GetForegroundWindow()==hwnd) return; if (!SetForegroundWindow(hwnd)) throw new Exception("Windows denied foreground activation; focus the authorized app manually."); return; }
      Foreground(hwnd); NoHeldModifiers();
      AutomationElement e=Target(hwnd,elementId);
      if (kind=="move" || kind=="click") {
        POINT point=Center(hwnd,e); Foreground(hwnd);
        if (!SetCursorPos(point.X,point.Y)) throw new Exception("Mouse movement failed.");
        if (kind=="click") {
          Foreground(hwnd); Center(hwnd,e);
          Send(new INPUT[] { new INPUT { type=0,data=new INPUTUNION { mouse=new MOUSEINPUT { dwFlags=0x0002 } } },new INPUT { type=0,data=new INPUTUNION { mouse=new MOUSEINPUT { dwFlags=0x0004 } } } });
        }
      } else if (kind=="invoke") {
        object pattern; if (!e.TryGetCurrentPattern(InvokePattern.Pattern,out pattern)) throw new Exception("Target does not expose UI Automation InvokePattern.");
        Foreground(hwnd); ((InvokePattern)pattern).Invoke();
      } else if (kind=="setText") {
        object pattern; if (!e.TryGetCurrentPattern(ValuePattern.Pattern,out pattern) || ((ValuePattern)pattern).Current.IsReadOnly) throw new Exception("Target has no writable UI Automation value.");
        Foreground(hwnd); ((ValuePattern)pattern).SetValue(text);
      } else if (kind=="typeText" || kind=="key") {
        if (!e.Current.HasKeyboardFocus) throw new Exception("Keyboard target is not focused. Select it explicitly first.");
        if (kind=="typeText") {
          foreach (char c in text) { Foreground(hwnd); if (!e.Current.HasKeyboardFocus || e.Current.IsPassword) throw new Exception("Keyboard focus changed."); Send(new INPUT[] {Key(0,c,4),Key(0,c,6)}); }
        } else {
          Dictionary<string,ushort> keys=new Dictionary<string,ushort> { {"Tab",9},{"Escape",27},{"Enter",13},{"ArrowLeft",37},{"ArrowRight",39},{"ArrowUp",38},{"ArrowDown",40},{"Home",36},{"End",35} };
          Foreground(hwnd);
          if (key=="Control+A") Send(new INPUT[] {Key(17,0,0),Key(65,0,0),Key(65,0,2),Key(17,0,2)});
          else { if (!keys.ContainsKey(key)) throw new Exception("Key is not allowed."); ushort vk=keys[key]; uint extended=(vk>=35 && vk<=40) ? 1U : 0U; Send(new INPUT[] {Key(vk,0,extended),Key(vk,0,extended|2)}); }
        }
      } else throw new Exception("Unsupported native action.");
    }
    public static bool CursorOnElement(long handle,string elementId) {
      AutomationElement e=Target(new IntPtr(handle),elementId); POINT cursor; if (!GetCursorPos(out cursor)) throw new Exception("Cannot verify cursor position.");
      return e.Current.BoundingRectangle.Contains(cursor.X,cursor.Y);
    }
    public static string Capture(long handle,string executable) {
      IntPtr hwnd=new IntPtr(handle); Window w=Observe(handle,executable);
      if (w.bounds.width>4096 || w.bounds.height>4096 || w.bounds.width*w.bounds.height>12000000) throw new Exception("Window capture exceeds size limits.");
      // PrintWindow captures only this application's surface, never pixels belonging to overlapping apps.
      using (Bitmap image=new Bitmap((int)w.bounds.width,(int)w.bounds.height)) {
        using (Graphics graphics=Graphics.FromImage(image)) {
          IntPtr dc=graphics.GetHdc(); bool ok;
          try { ok=PrintWindow(hwnd,dc,2); } finally { graphics.ReleaseHdc(dc); }
          if (!ok) throw new Exception("Application refused window capture; no screen-wide fallback is allowed.");
          foreach (Element e in w.elements) if (e.password) graphics.FillRectangle(Brushes.Black,(float)(e.bounds.x-w.bounds.x),(float)(e.bounds.y-w.bounds.y),(float)e.bounds.width,(float)e.bounds.height);
        }
        using (MemoryStream stream=new MemoryStream()) { image.Save(stream,ImageFormat.Png); return Convert.ToBase64String(stream.ToArray()); }
      }
    }
  }
}
