/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: composer_utils.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: utility functions for composer window

******************************************************************************/

Components.utils.import('resource://stationery/content/stationery.jsm');
Components.utils.import('resource://gre/modules/iteratorUtils.jsm');
Components.utils.import("resource://gre/modules/mailServices.js");
Components.utils.import("resource://gre/modules/Services.jsm");

var EXPORTED_SYMBOLS = [];

Stationery.definePreference('ApplyStationery_New', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_MailToUrl', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ReplyAll', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ForwardAsAttachment', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ForwardInline', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_NewsPost', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ReplyToSender', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ReplyToGroup', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ReplyToSenderAndGroup', { type: 'bool', default: true } );


/*
  Extracts all metadata from HTML in given editor.
  important: only <meta> with name and content atribs will be processed, and only this two atribs values 
    will be extracted. 
  returned object members:
    allMeta: associative array, with meta name as key, and meta content as value.
    //other mandatory members.
    //they will exists always, with default values if corresponding <meta> does not exist.
    supressStandardSignature - boolean //todo: zaimplementować!
    
    //other optional members - may exist or not, according to existence of specific <meta>
    .... //todo
*/
/*
Stationery.extractMetaData = function(editor /*nsIEditor*) {

  function recurse(nodes) {
    for (let i = 0 ; i < nodes.length; i++) {
      let node = nodes[i];

      if((node.nodeName == 'META') && node.hasAttribute('name')) {

        let metaName = node.getAttribute('name');
        let metaContent = '';
        if(node.hasAttribute('content'))
          metaContent = node.getAttribute('content');
        
        result.all[metaName] = metaContent;
          
        //check, maybe it is meaningful attribute
        if(metaName.match(/stationery-supressStandardSignature/i))
          result.supressStandardSignature = metaContent.match(/true/i);
      };

      if (node.hasChildNodes()) recurse(node.childNodes);
    }
  }
  
  try {
    let result = { 
      all: [],
      supressStandardSignature: false
    };
    recurse(editor.rootElement.parentNode.childNodes);
  } catch (e) {
    Stationery.handleException(e);
  }
  return result;
}
*/


//TODO: add preference to disable this entirely, and to disable parts ot it.
// this function remove many unused or harmful HMTL elements used in OE Stationery templates.
Stationery.cleanUpDomOfNewlyLoadedTemplate = function(editor /*nsIEditor*/) {

  function recurse(nodes) {
    for (let i = 0 ; i < nodes.length; i++) {
      let node = nodes[i];
      if ( 
        node.nodeName=="SCRIPT" ||
        node.nodeName=="BGSOUND" ||
        node.nodeName=="LINK" ||
        node.nodeName=="META" || // todo: remove only META with encoding, and Stationery metadata. in mail encoding is forced by MIME headers
        node.nodeName=="BASE" || 
        node.nodeName=="TITLE" ||
        //line bellow remove <div> used in many OE stationery to auto-scrolloing (with script). I check it is empty, and if yes, then remove it.
        (node.nodeName=="DIV" && node.hasAttribute("id") && node.id.match(/^imageholder$/i) && node.hasAttribute("style") && node.getAttribute("style").match(/left\s*:\s*-1\s*px;\s*position\s*:\s*absolute;\s*top\s*:\s*-1\s*px;/i) && (!node.nodeValue || node.nodeValue.match(/^\s*$/i)) ) ||
        //another version of above, with table. I do not check content emptiness...
        (node.nodeName=="TABLE" && node.hasAttribute("id") && node.id.match(/^imageholder$/i) && node.hasAttribute("style") && node.getAttribute("style").match(/left\s*:\s*-1\s*px;\s*position\s*:\s*absolute;\s*top\s*:\s*-1\s*px;/i) ) ||
        //also OE propertiary markup inside comments
        (node.nodeName=="#comment" && node.nodeValue.match(/^webbot.*/i)) 
      ) {
        node.parentNode.removeChild(nodes[i--]); //decrement i, becasue "nodes" is now shorter by 1
      }
    }
    
    for (let i = 0 ; i < nodes.length; i++) 
      if (nodes[i].hasChildNodes()) 
        recurse(nodes[i].childNodes);
  }    
  recurse(editor.rootElement.parentNode.childNodes);
}

Stationery.getTemplatePlaceholder = function(win, nodes, type) {
  if (!nodes) //initialize recurrency
    return Stationery.getTemplatePlaceholder(win, win.GetCurrentEditor().rootElement.childNodes, type);

  for(let i = 0 ; i < nodes.length; i++) {
    let node = nodes[i];

    if((node.hasAttribute) && (node.getAttribute) && node.hasAttribute("stationery") && node.getAttribute("stationery") == type + "-placeholder")
      return node;

    if (node.hasChildNodes()) {
      node = Stationery.getTemplatePlaceholder(win, node.childNodes, type);
      if(node) return node;
    }
  }
  return null;
}

Stationery.setCaretPosition = function(win, nodes) { //todo: make it take editor, not window!!
  try {
    let editor = win.GetCurrentEditor();
    let caretSpan = editor.rootElement.childNodes[0].ownerDocument.getElementById('_AthCaret');
    if (caretSpan) {
      editor.selection.collapse(caretSpan, 0);
      caretSpan.parentNode.removeChild(caretSpan);
    }
  } catch(e) {}
}

Stationery.getSignatureNode = function(editor /*nsIEditor*/) {

  function recurse(nodes) {
    for (let i = 0 ; i < nodes.length; i++) {
      let node = nodes[i];

      if((node.hasAttribute) && (node.getAttribute) 
        && node.hasAttribute("class") && node.getAttribute("class") == "moz-signature"
        && !node.hasAttribute("stationery")
      )
        return node;

      //search child nodes, but not "BLOCKQUOTE" ones. we do not want cited signature.
      if (node.hasChildNodes() && node.nodeName != 'BLOCKQUOTE') {
        node = recurse(node.childNodes);
        if(node) return node;
      }
    }
    return null;
  }
  return recurse(editor.rootElement.childNodes);
}

//fix <style> tag contents in blockquote.
// TB pastes there whole <style> tag from original email, and if this tag contain styles for <body> then all this mail CSS will be broken.
//fixes:
//  1) "body {" is replaced to "blockquote[cite="mid:003501c7af69$184fac50$7101a8c0@Antares"] {" where selector points to parent blockquote
//  2) all other tags gets blockquote[cite="mid:003501c7af69$184fac50$7101a8c0@Antares"] selector before their original selector.
Stationery.fixBlockquoteStyle = function(editor /*nsIEditor*/, nodes) {

  let id = '';
  if (!nodes) //need to initialize
    nodes = editor.rootElement.childNodes;
//TODO: now it fix only <style> blocks directly in <blockqoute>. 
//Change it to fix al <style> blocks, but do not go inside <blockquote> blocks that are fixed already. Or maybe fix them anyway? should not hurt.
  function updateCSSblock(node) {
    for (let i = 0 ; i < node.childNodes.length; i++) {
      let styleNode = node.childNodes[i];
      if (styleNode.nodeName=='STYLE') {
        let newContent = '';
        let rules = styleNode.sheet.cssRules;
        for(let r = 0; r < rules.length; r++)
        try { //some rules are more complex (@fontXX, @import), so there will be exteption. so just ignore this exception
          newContent = newContent + id + ' ' //add ID before first selector
            + rules[r].selectorText
              .replace(/body/igm, '') //clear 'body' selector
              .replace(id, ' ') //clear existing 'id' selectors, to avoid double 'id' selector
              .replace(/,/igm, ",\n" + id) //add 'id' selector before any additional selector.  
            + ' { ' + rules[r].style.cssText + " }\n";
        } catch (e) { }
        styleNode.textContent = newContent;
      }
      if (node.hasChildNodes() && (node.nodeName != 'BLOCKQUOTE')) //do not steep into "BLOCKQUOTE".
        updateCSSblock(styleNode);
    }
  }


  for (let i = 0 ; i < nodes.length; i++) {
    let node = nodes[i];

    if (node.nodeName=='BLOCKQUOTE') {
      if (node.hasAttribute('id'))
        id = node.getAttribute('id');
      else
        if (node.hasAttribute('cite'))
          id = node.getAttribute('cite');
        else
          id = 'Cite_' + Math.floor((Math.random() * 10000000));
      id = id.replace(/\W/g, '_')
      node.setAttribute('id', id);
      id = '#' + id; //make CSS selector
      updateCSSblock(node);
      Stationery.addClass(node, 'cite'); //set class, to allow CSS styling for incompatible MS MUA

/*
      //enclose <blockquore> in another <blockquote>, to force Outlook2005+ to render this <blockquote> correctly.
      //also, <blockquote type="cite"> gets some editing magic in Composer (enter breaks all levels of <<blockquote>),
      //and this will help us. 
      //but to make this extra <blockquote> invisible, I need to add lot of CSS to hide borders, etc.
      let box = node.ownerDocument.createElement('blockquote');
      box.setAttribute('type', 'cite');
      box.setAttribute('style', 'border: 0px solid transparent !important; margin: 0px !important; padding: 0px !important; background: none repeat scroll 0% 0% transparent ! important;');
      node.parentNode.appendChild(box);
      box.appendChild(node);
*/ 
    }

    if (node.hasChildNodes()) 
      Stationery.fixBlockquoteStyle(editor, node.childNodes);
  }
}


//how to find/set cursor position? 
// seek through all nodes, and if node is #TEXT then count number of characters in.
// stop when Node = selection.focusNode, and then add htmled.selection.focusOffset instead of node characters count. 
// reverse function is similar, but in every node we decrease cursor offset by number of characters in node.
// if cursor offset < number of characters in current node then we set this node as selection, 
// and set remaining  cursor offset as selection offset.

Stationery.getCursorOffset = function (editor /*nsIEditor*/) {

  let cursorOffset = 0;
  
  function recurse(nodes) {
    for (let i = 0 ; i < nodes.length; i++) {
      let node = nodes[i];

      if(node.nodeType == node.TEXT_NODE) {
        if(node === editor.selection.focusNode) {
          cursorOffset += editor.selection.focusOffset;
          return true; 
        }
        cursorOffset += node.nodeValue.length;
      } else
        if(node === editor.selection.focusNode)
          return true; 
        
      if (node.hasChildNodes())
        if (recurse(node.childNodes)) return true;
    }
    return false;
  }

  if (recurse(editor.rootElement.childNodes)) return cursorOffset;
  return 0; //editor.selection.focusNode not found
}


Stationery.setCursorOffset = function (editor /*nsIEditor*/, offset) {

  let cursorOffset = offset;
  
  function recurse(nodes) {
    for (let i = 0 ; i < nodes.length; i++) {
      let node = nodes[i];

      if(node.nodeType == node.TEXT_NODE) {
        if(cursorOffset <= node.nodeValue.length) {
          let range = editor.document.createRange();
          range.setStart(node, cursorOffset);
          range.setEnd(node, cursorOffset);
          editor.selection.removeAllRanges();
          editor.selection.addRange(range);
          return true; 
        } else
          cursorOffset -= node.nodeValue.length;
      } else   
        if (node.hasChildNodes())
          if (recurse(node.childNodes)) return true;
    }
    return false;
  }
  
  recurse(editor.rootElement.childNodes)
}

Stationery.fixImagesPaths = function(htmlDocument) {
  let images = htmlDocument.getElementsByTagName('IMG');
  for (let i = 0 ; i < images.length; i++) {
    let node = images[i];
    if (node.hasAttribute('src')) {
      if (node.src.match(/mailbox:\/\/\/(.)(?:%7C|\|)\//i))
        node.src = node.src.replace(/mailbox:\/\/\/(.)(?:%7C|\|)\//i, 'mailbox:///$1%3A/');
        
      if (node.src.match(/file:\/\/\/(.)(?:%7C|\|)\//i)) 
        node.src = node.src.replace(/file:\/\/\/(.)(?:%7C|\|)\//i, 'file:///$1%3A/');
    }
  }  
}

function useFontPreview() {
  if (typeof useFontPreview.useFontPreview === "undefined")
    useFontPreview.useFontPreview = Stationery.fontEnumerator.EnumerateAllFonts({ value: 0 }).length < 300;
  return useFontPreview.useFontPreview;
}

function adjustAddressingWidget(wnd) {
  let linesNo = Stationery.getPref('AddresingWidgetLines');
  if (linesNo == 0) return; //no change
  while (linesNo > 10) linesNo = linesNo / 10;

  let addressingWidget = wnd.document.getElementById('addressingWidget');
  let MsgHeadersToolbar = wnd.document.getElementById('MsgHeadersToolbar'); 

  //height of one row  
  let oneRowHeight = wnd.document.getElementById('addressCol1#1').parentNode.boxObject.height;
  //how many height we need to add to get MsgHeadersToolbar height from rows height.
  //include all other elements on MsgHeadersToolbar except addressingWidget client area 
  let ExtraHeight = 8 + MsgHeadersToolbar.boxObject.height - addressingWidget.boxObject.element.clientHeight;
    
  //set min and current height...  
  MsgHeadersToolbar.removeAttribute('minheight');
  MsgHeadersToolbar.style.minHeight = '' + (oneRowHeight + ExtraHeight) + 'px';
  MsgHeadersToolbar.style.height =  '' + (oneRowHeight * linesNo + ExtraHeight) + 'px';
  //since TB 24 setting style.height is not enough, so I added line bellow:
  MsgHeadersToolbar.height = oneRowHeight * linesNo + ExtraHeight;

  //update addressingWidget internals
  wnd.awCreateOrRemoveDummyRows();
}

Stationery.onComposeBodyReady = function(wnd) {
  try{
    wnd.Stationery_.OriginalContent = false;
    //wnd.Stationery_.identityChangedNewSignature = false;
    wnd.Stationery_.forceApplying = false;
    wnd.Stationery_.templateCanBeChanged = wnd.gMsgCompose.compFields.draftId == '';
    Stationery.updateMenusInWindow(wnd);
      
    adjustAddressingWidget(wnd);
    wnd.Stationery_.ApplyTemplate();
    
    wnd.setTimeout(function() {
      wnd.document.getElementById('FontFaceSelect').setAttribute('maxwidth', 250);
      let FontFacePopup = wnd.document.getElementById('FontFacePopup')
      let nodes = FontFacePopup.childNodes;
        
      nodes[1].setAttribute('style', 'font-family: monospace !important;');
      nodes[3].setAttribute('style', 'font-family: Helvetica, Arial, sans-serif !important;');
      nodes[4].setAttribute('style', 'font-family: Times, serif !important;');
      nodes[5].setAttribute('style', 'font-family: Courier, monospace !important;');

      //todo customize fonts AFTER composer is shown, as background task
      if (useFontPreview()) 
        for (let i = 7; i < nodes.length; ++i) {
          let n = nodes[i];
          n.setAttribute('style', 'font-family: "' + n.value + '" !important;');
          n.tooltipText = n.value;
        }
    }, 0);
  } catch (e) { Stationery.handleException(e); }
  
}

Stationery.plainText2HTML = function(text) {
  var tagsToReplace = { '\r\n': '<br>', '\r': '<br>', '\n': '<br>', '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  return text.replace(/\r\n|[\r\n&<>]/g, function (tag) { return tagsToReplace[tag] || tag; });
}

Stationery.HTML2PlainText = function(html) {
  let enc = Components.interfaces.nsIDocumentEncoder;
  return Stationery.parserUtils.convertToPlainText(html, 
    enc.OutputFormatted || 
    enc.OutputBodyOnly || 
    enc.OutputCRLineBreak ||
    end.OutputAbsoluteLinks ||
    0, 0);
}
