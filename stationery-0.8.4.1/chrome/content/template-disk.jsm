/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: template-disk.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: template handler for file:// templates

******************************************************************************/
'use strict';

Components.utils.import('resource://stationery/content/stationery.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');

var EXPORTED_SYMBOLS = [];

const handlerType = 'file';

Stationery.templates.registerHandler({
  type: handlerType,
  
  getTip: function(template) { 
    return Stationery._f('template.file.template.tip', [template.url]); 
  },
  
  getDisplayUrl: function(template) { 
    return templateUrlToRealFilePath(template.url);
  },

  
  //should load template, and add 'template.HTML' and/or 'template.Text' properties to template (for HTML or plainText template).
  //in case of error should set 'template.loadingError' to string describing error
  loadTemplate: function(template) { 
    //todo: currently only HMTL files, in future add support for plain-text files
    readHTMLTemplateFile(template);
  },
  
  //this function should return menuitem. This item will be added to Stationery menu as root for this handler items.
  generateMenuitem: function(document, context) {
    if (context == 'options.add') 
      return Stationery.makeElement(document, 'menuitem', {
        label: Stationery._('template.file.menuitem.labelAdd'), 
        tooltip: Stationery._('template.file.menuitem.tip'),
      });
    //else  
    return Stationery.makeElement(document, 'menuitem', {
      label: Stationery._('template.file.menuitem.label'), 
      tooltip: Stationery._('template.file.menuitem.tip'),
    });
  },
  
  //called to handle click on menuitem generated in generateMenuitem 
  //return true if template should be applied (or new composer opened)
  onHandlerMenuitemCommand: function (event) {
    try {
      let template = openNewTemplate(event.view);
      let identity = event.target.getAttribute('stationery-identity-key');
      if (template) {
        Stationery.templates.setCurrent(event.target.getAttribute('stationery-identity-key'), template);        
        return true;
      }
    } catch (e) { Stationery.handleException(e); }

    //if we reach here, then user must cancelled, or exception was thrown
    return false;
  },
  
  //called to create new template of given type. 
  //ex. for disk template it will browse for template file
  //return new template, or false
  makeNewTemplate: function(window) { 
    return openNewTemplate(window);    
  },
  
  //return true if given template is duplicate of some other 
  isDuplicate: function(baseTemplate, comparedTemplate) { 
    return baseTemplate.type == comparedTemplate.type
        && baseTemplate.url == comparedTemplate.url; 
  },
  
  
  postprocess: function(template, HTMLEditor, gMsgCompose, Stationery_) {
    let basePath = template.filePath.substring(0, template.filePath.lastIndexOf(Stationery.getFilePathSeparator()) + 1);
    fixImagesPathsInTemplate(HTMLEditor.rootElement.ownerDocument, basePath, null, gMsgCompose);
  },
});


// private utility functions 

function openNewTemplate(win) {
  let template = null;
  
  // code to open file on disk 
  let fp = Stationery.XPCOM('nsIFilePicker');
  fp.init(win, Stationery._('template.file.selectDialog.title'), fp.modeOpen);
  fp.appendFilters(fp.filterHTML);
  
  let defaultSearchPath = Stationery.getPref('DefaultSearchPath');
  if (defaultSearchPath != '')
    if (defaultSearchPath.substr(0, 11) == 'profile:///') {
      let profileDir = Services.dirsvc.get('ProfD', Components.interfaces.nsILocalFile);
      profileDir.appendRelativePath(defaultSearchPath.substr(11))
      if(!profileDir.exists()) 
        profileDir.create(profileDir.DIRECTORY_TYPE, 777);
      fp.displayDirectory = profileDir;
    } else {
      let directory = Stationery.XPCOM('nsILocalFile');
      directory.initWithPath(defaultSearchPath);
      fp.displayDirectory = directory;
    }

  if (fp.show() == fp.returnOK)
    return Stationery.templates.makeTemplate(handlerType, makeAbbrevTamplateName(fp.file.path), filePathToTemplateUrl(fp.file.path));
  return false;
}

function templateUrlToRealFilePath(templateUrl) {
  if (templateUrl.substr(0, 11) == 'profile:///') {
    let profileDir = Services.dirsvc.get('ProfD', Components.interfaces.nsILocalFile);
    templateUrl = templateUrl.replace('profile:///', profileDir.path + Stationery.getFilePathSeparator());
  }
  //fix slash and back-slash to platform one  
  return templateUrl.replace(/(\/)|(\\)/ig, Stationery.getFilePathSeparator());
}

function filePathToTemplateUrl(filePath) {
  let profileDir = Services.dirsvc.get('ProfD', Components.interfaces.nsILocalFile);
  return filePath.replace(profileDir.path + Stationery.getFilePathSeparator(), 'profile:///');
}

function makeAbbrevTamplateName(templateUrl) {
  templateUrl = templateUrl.replace('profile:///', Stationery.getFilePathSeparator());
  templateUrl = templateUrl.substring(templateUrl.lastIndexOf(Stationery.getFilePathSeparator()) + 1, templateUrl.length);
  return templateUrl.substring(0, templateUrl.lastIndexOf("."));
}

function readHTMLTemplateFile(template) {
  try {
    let pathToprofileDir = Services.dirsvc.get('ProfD', Components.interfaces.nsIFile).path;
    
    template.filePath = templateUrlToRealFilePath(template.url);
    
    let is, sis;
    let file = Stationery.XPCOM('nsILocalFile');
    try {
      file.initWithPath(template.filePath);
      if (!file.exists()) {
        template.loadingError = Stationery._f('template.file.not.exists', [template.url])
        return;
      }

      let is = Stationery.XPCOM('nsIFileInputStream');
      is.init(file, 1, 0, null);
      let sis = Stationery.XPCOM('nsIScriptableInputStream');
      sis.init(is);
      //read header, look for BOM (byte-order-mark) characters.
      let bom = sis.read(3);
      //is.QueryInterface(Components.interfaces.nsISeekableStream).seek(is.NS_SEEK_SET, 0);
      is.seek(is.NS_SEEK_SET, 0);
      
      let bomCharset = false;
      if (bom.charCodeAt(0) == 239 && bom.charCodeAt(1) == 187 && bom.charCodeAt(2) == 191) bomCharset = 'UTF-8'; //UTF-8 BOM
      if (bom.charCodeAt(0) == 255 && bom.charCodeAt(1) == 254) bomCharset = 'UTF-16LE';  //UTF-16 LE BOM
      if (bom.charCodeAt(0) == 254 && bom.charCodeAt(1) == 255) bomCharset = 'UTF-16BE';  //UTF-16 BE BOM
      
      if (bomCharset) {
        //This is kind of Unicode encoded file, it can't be readed using simple scriptableinputstream, because it contain null characters (in terms of 8-bit strings). 
        sis.close();
        //reinit "is" because sis.close(); closes "is" too
        is.init(file, 1, 0, null);
        
        sis = Stationery.XPCOM('nsIConverterInputStream');
        sis.init(is, bomCharset, is.available(), sis.DEFAULT_REPLACEMENT_CHARACTER);
        let str = {};
        while (sis.readString(-1, str) != 0) template.HTML = template.HTML + str.value
        sis.close();
        
      } else {
        template.HTML = sis.readBytes(sis.available());
        sis.close();

        //looking for charset definition in file, and recode file to unicode
        //try speed up, by copying all text till </head> into variable        
        let head = template.HTML.replace(/(.*)\/head/i);
        let CSet = head.match(/<\?.*xml .*encoding *= *["'](.*)["'].*\?>/i);
        if (CSet) CSet = CSet[1];
        else {
          CSet = head.match(/<META +HTTP-EQUIV *= *["']Content-Type["'].*CONTENT *= *["'].*; *charset= *["']?(.*?)["']?["'].*>/i);
          if (CSet) CSet = CSet[1]
          else {
            CSet = head.match(/<META +CONTENT *= *["'].*; *charset= *["']?(.*?)["']?["'].*HTTP-EQUIV *= *["']Content-Type["'].*>/i);
            if (CSet) CSet = CSet[1];
          }
        }
        if (!CSet) 
          CSet = Stationery.getPref('DefaultTemplateEncoding');
        if (CSet) 
          template.HTML = Stationery.toUnicode(CSet, template.HTML);
      }
    } catch (e) {
      Stationery.handleException(e);
      try { sis.close(); } catch (e) {}
      try { is.close(); } catch (e) {}
    }
  } catch (e) {
      Stationery.handleException(e);
  }
}

//function used to fix images paths in imported templates.
function fixImagesPathsInTemplate(htmlDocument, newPath, nodes, gMsgCompose) {

  let filePathSeparator = Stationery.getFilePathSeparator();
  
  function fixPath(node, attrib, asData) { //internal helper
    if(!node.hasAttribute(attrib)) return;
    //if filename is in one of special protocols, then assume it is valid and encoded.
    let filename = node.getAttribute(attrib);
    if(!filename.match(/^(http|https|chrome|file|data):/)) {
      //path and filename are in unicode, but TB accepts percent sign encoded url's only as UTF-8. so recode...
      filename = 'file:///' + escape(Stationery.fromUnicode('UTF-8', newPath + unescape(filename).replace(/\//g, filePathSeparator)))
    }
    
    if (asData && filename.match(/^(http|https|chrome|file):/)) {
      node.setAttribute(attrib, 'data:image/*;base64,' + btoa(Stationery.getURIContent(filename)) );
    } else
      node.setAttribute(attrib, filename);
  }

  let mct = Components.interfaces.nsIMsgCompType;
  let needBackgroundBugFix = gMsgCompose.type == mct.Reply ||
                             gMsgCompose.type == mct.ReplyToSender ||
                             gMsgCompose.type == mct.ReplyAll ||
                             gMsgCompose.type == mct.ForwardInline;
  let nodes = htmlDocument.getElementsByTagName('BODY');
  for (let i = 0 ; i < nodes.length; i++) fixPath(nodes[i], 'background', needBackgroundBugFix);

  let nodes = htmlDocument.getElementsByTagName('IMG');
  for (let i = 0 ; i < nodes.length; i++) fixPath(nodes[i], 'src', false);
}