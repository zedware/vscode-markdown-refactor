({
  onWillParseMarkdown: function(markdown) {
    return markdown;
  },

  onDidParseMarkdown: function(html) {
    function markerInfo(marker) {
      if (marker === "[ ]") return { text: " ", className: "todo" };
      if (marker === "[/]") return { text: "/", className: "progress" };
      if (marker === "[x]" || marker === "[X]") return { text: "x", className: "done" };
      if (marker === "[-]") return { text: "-", className: "cancelled" };
      if (marker === "[!]") return { text: "!", className: "important" };
      return { text: marker, className: "emoji-checkbox" };
    }

    function checkboxHtml(marker) {
      var info = markerInfo(marker);
      return '<span class="task-list-item-checkbox custom-checkbox ' + info.className + '">' + info.text + '</span>';
    }

    function addClassValue(value, className) {
      return value.indexOf(className) >= 0 ? value : value + " " + className;
    }

    function addTaskClass(attrs) {
      attrs = attrs || "";
      if (/class\s*=/.test(attrs)) {
        return attrs.replace(/class=(['"])(.*?)\1/, function(match, quote, value) {
          var classes = addClassValue(value, "task-list-item");
          classes = addClassValue(classes, "custom-task-list-item");
          return 'class=' + quote + classes.replace(/^\s+|\s+$/g, "") + quote;
        });
      }
      return attrs + ' class="task-list-item custom-task-list-item"';
    }

    function replaceCheckboxInput(match, liAttrs, pOpen, inputAttrs) {
      var marker = /checked/i.test(inputAttrs) ? "[x]" : "[ ]";
      return '<li' + addTaskClass(liAttrs) + '>' + (pOpen || "") + checkboxHtml(marker) + ' ';
    }

    function replaceMarker(match, liAttrs, pOpen, marker) {
      return '<li' + addTaskClass(liAttrs) + '>' + (pOpen || "") + checkboxHtml(marker) + ' ';
    }

    html = html.replace(/<li([^>]*)>\s*(<p\b[^>]*>\s*)?<input\b([^>]*type=["']checkbox["'][^>]*)>\s*/gi, replaceCheckboxInput);

    html = html.replace(/<li([^>]*)>\s*(<p\b[^>]*>\s*)?(\[\/\]|\[-\]|\[!\]|\[[xX]\]|\[ \]|\u2B1C|\u23F3|\u2705|\u274C|\u2757)(?:\s|&nbsp;)+/g, replaceMarker);

    return '<!-- markdown-refactor-mpe-parser:onDidParseMarkdown -->\n' + html;
  }
})
