{
   "_id": "_design/tagin",
   "views": {
       "tagToFingerprint": {
           "map": "function(doc) {if (doc.type === 'fingerprint') {emit(doc.tag, doc);}}"
       },
       "macToFingerprint": {
           "map": "function(doc) {if (doc.type === 'fingerprint') {emit(doc.beacon_mac, doc.urn);}}",
           "reduce": "function(keys, values) {var urns = {}; values.forEach(function(urn) {if(!urns[urn]) {urns[urn] = true;}}); return urns;}"
       },
       "fingerprintToTag": {
           "map": "function(doc) {if (doc.type === 'fingerprint') {emit(doc.urn, doc.tag);}}",
           "reduce": "function(keys, values) {var tags = {}; values.forEach(function(tag) {if(!tags[tag]) {tags[tag] = true;}}); return tags;}"
       },
       "radio": {
           "map": "function(doc) {if (doc.type === 'radio') {emit(doc.radio_id, doc.min_rssi); emit(doc.radio_id, doc.max_rssi);}}",
           "reduce": "function(key, values) {return {min_rssi: Math.min.apply(null, values), max_rssi: Math.max.apply(null, values)};}"
       }
   }
}