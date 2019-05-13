const http = require('http')
const fs = require('fs')
const path = require('path')
const url = require('url')
const qs = require('querystring')
const util = require('util')
const config = require('./config')

const privateKey = config.privateKey
const privateValue = config.privateValue
const jsonFilePath = config.jsonFilePath

const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)

const loadJsonData = async () => {
  const data = await readFile(jsonFilePath)
  const jsonData = JSON.parse(data)

  return jsonData
}

const saveJsonData = async (jsonData) => {
  writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2))
}

const checkPublicYn = (obj) => {
  let publicYn = 'Y'

  if (obj[privateKey.toLowerCase()] && obj[privateKey.toLowerCase()] === privateValue) {
    publicYn = 'N'
  } else if (obj[privateKey.toUpperCase()] && obj[privateKey.toUpperCase()] === privateValue) {
    publicYn = 'N'
  }

  return publicYn
}

const getContentType = (extName) => {
  let contentType = 'text/html'
  switch (extName) {
    case '.js':
      contentType = 'text/javascript'
      break
    case '.css':
      contentType = 'text/css'
      break
    case '.json':
      contentType = 'application/json'
      break
    case '.png':
      contentType = 'image/png'
      break
    case '.jpg':
      contentType = 'image/jpg'
      break
    case '.ico':
      contentType = 'image/ico'
      break
    case '.wav':
      contentType = 'audio/wav'
      break
  }

  return contentType
}

const responseEnd = (res, contentType, data) => {
  res.writeHead(200, { 'Content-Type': contentType })
  res.end(data, 'utf-8')
}

const saveSiteInfo = async (postData) => {
  if (checkPublicYn(postData) === 'N') {
    const jsonData = await loadJsonData()

    if (postData.site_idx) {
      // 업데이트
      const targetSite = jsonData.site_info.filter(x => x.site_idx === Number(postData.site_idx))[0]
      targetSite.category_idx = Number(postData.category_idx)
      targetSite.name = postData.name
      targetSite.url = postData.url
      targetSite.url_mobile = postData.url_mobile
      targetSite.sort = Number(postData.sort)
      targetSite.use_yn = postData.use_yn
      targetSite.update_date = Date.now()
    } else {
      // 인서트
      const maxSiteIdx = jsonData.site_info.reduce((acc, curr) => {
        return acc.site_idx > curr.site_idx ? acc : curr
      }).site_idx

      const newSiteInfo = {
        site_idx: maxSiteIdx + 1,
        name: postData.name,
        url: postData.url,
        url_mobile: postData.url_mobile,
        sort: postData.sort,
        use_yn: postData.use_yn,
        category_idx: postData.category_idx,
        create_date: Date.now(),
        update_date: Date.now(),
      }

      console.log(newSiteInfo)
      jsonData.site_info.push(newSiteInfo)
    }

    // sort 값 정리
    jsonData.site_info
      .filter(x => x.category_idx === postData.category_idx
        && x.sort >= postData.sort
        && x.name !== postData.name)
      .sort((prev, next) => {
        return prev.sort > next.sort
      })
      .reduce((acc, curr, i) => {
        curr.sort = postData.sort + (i + 1)
      })

    saveJsonData(jsonData)
  }
}

http.createServer(async (req, res) => {
  const urlPath = url.parse(req.url).pathname

  if (urlPath === '/site') {
    if (req.method === 'GET') {
      // 사이트 조회
      const publicYn = checkPublicYn(qs.parse(url.parse(req.url).query))
      const siteIdx = Number(qs.parse(url.parse(req.url).query).siteIdx)

      const jsonData = await loadJsonData()
      const siteInfo = jsonData.site_info.filter(x => x.site_idx === siteIdx && publicYn === 'N')[0]

      const contentType = getContentType('.json')
      const content = JSON.stringify(siteInfo)
      responseEnd(res, contentType, content)
    } else if (req.method === 'POST') {
      // 사이트 저장
      let reqBody = '';
      req.on('data', (data) => {
        reqBody += data;

        // Too much POST data, kill the connection!
        // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
        if (reqBody.length > 1e6)
          request.connection.destroy();
      });

      req.on('end', () => {
        const postData = qs.parse(reqBody);
        saveSiteInfo(postData)
      });

      res.end()
    }
  } else if (urlPath === '/list') {
    // 전체 조회
    const jsonData = await loadJsonData()
    const publicYn = checkPublicYn(qs.parse(url.parse(req.url).query))
    const categoryList = jsonData.category_info
      .filter(x => x.use_yn === 'Y' && (x.public_yn === publicYn || publicYn === 'N'))
      .sort((prev, next) => {
        return prev.sort - next.sort
      })
    const siteList = jsonData.site_info
      .filter(x => x.use_yn === 'Y' && categoryList.map(x => x.category_idx).includes(x.category_idx))
      .sort((prev, next) => {
        return prev.sort - next.sort
      })

    const result = {
      publicYn,
      categoryList,
      siteList,
    }

    const contentType = getContentType('.json')
    const content = JSON.stringify(result)

    responseEnd(res, contentType, content)
  } else if (urlPath === '/clean') {
    const jsonData = await loadJsonData()

    const categoryList = jsonData.category_info.sort((prev, next) => {
      return Number(prev.sort) > Number(next.sort) ? prev : next
    })
    for (let i = 0; i < categoryList.length; i++) {
      const cate = jsonData.category_info.filter(x => Number(x.category_idx) === Number(categoryList[i].category_idx))[0]
      cate.category_idx = Number(cate.category_idx)
      cate.sort = (i + 1)
      cate.create_date = new Date(cate.create_date).valueOf()
      cate.update_date = new Date(cate.update_date).valueOf()

      const siteList = jsonData.site_info
        .filter(x => Number(x.category_idx) === cate.category_idx)
        .sort((prev, next) => {
          return Number(prev.sort) > Number(next.sort) ? prev : next
        })
      for (let j = 0; j < siteList.length; j++) {
        const site = jsonData.site_info.filter(x => Number(x.site_idx) === Number(siteList[j].site_idx))[0]
        site.category_idx = Number(site.category_idx)
        site.site_idx = Number(site.site_idx)
        site.sort = (j + 1)
        site.create_date = new Date(site.create_date).valueOf()
        site.update_date = new Date(site.update_date).valueOf()
      }

    }

    saveJsonData(jsonData)

    res.end()
  } else {
    // 이후 nginx가 해줄 부분
    let filePath = '.' + urlPath
    if (filePath === './') {
      filePath = './index.html'
    }

    const extName = path.extname(filePath)
    const contentType = getContentType(extName)
    const content = await readFile(filePath)

    responseEnd(res, contentType, content)
  }
}).listen(config.listenPort, () => {
  console.log(`${config.listenPort} standby`)
})