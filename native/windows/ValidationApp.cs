using System;
using System.Drawing;
using System.Windows.Forms;

// Disposable validation target. It has no file, network, shell, or account access.
public static class ValidationApp {
  [STAThread]
  public static void Main() {
    Application.EnableVisualStyles();
    Form form = new Form { Text = "AGENTS Windows validation — disposable fixture", Width = 620, Height = 380, StartPosition = FormStartPosition.CenterScreen };
    TextBox input = new TextBox { AccessibleName = "Sample input", Location = new Point(30, 40), Width = 400, TabIndex = 0 };
    TextBox password = new TextBox { AccessibleName = "Protected fixture", Location = new Point(30, 100), Width = 400, UseSystemPasswordChar = true, Text = "synthetic-test-value", TabIndex = 1 };
    Label result = new Label { Text = "Waiting", Location = new Point(30, 220), Width = 400 };
    Button button = new Button { AccessibleName = "Confirm sample", Text = "Confirm sample", Location = new Point(30, 160), Width = 180, TabIndex = 2 };
    button.Click += delegate { result.Text = "Confirmed"; };
    Button reset = new Button { AccessibleName = "Reset sample", Text = "Reset sample", Location = new Point(240, 160), Width = 180, TabIndex = 3 };
    reset.Click += delegate { result.Text = "Waiting"; };
    form.Controls.Add(reset);
    form.Controls.Add(input); form.Controls.Add(password); form.Controls.Add(button); form.Controls.Add(result);
    form.Shown += delegate { input.Focus(); };
    Application.Run(form);
  }
}
