const { Project, ProjectImage, ProjectPermission, File } = require('../services/db/Db')
const { createProject } = require('./createProject')
const Trianglify = require('trianglify')
const { ApiError } = require('../helpers/ApiError')
const { BAD_REQUEST } = require('http-status-codes')
const { getDefaultProjectPermissions } = require('../helpers/getDefaultProjectPermissions')
const { apiTokens } = require('../api-tokens/apiTokens')
const { apiUsers } = require('../users/apiUsers')
const { apiModels } = require('../models/apiModels')

class ApiProjects {
  async getProjects(clientId) {
    const projectIds = await ProjectPermission.find({ clientId, projectRead: true }, { projectId: true })
    if (!projectIds.length) return []
    return await Project.find({ $or: projectIds.map(item => ({ _id: item.projectId })) })
  }

  async getProjectImage(projectId) {
    const image = await ProjectImage.findOne({ projectId: projectId })
    return image
  }

  async postProject(clientId, project) {
    const createdProject = createProject({ project, noId: true })
    const savedProject = await Project.insert(createdProject)
    await ProjectPermission.insert({
      projectId: savedProject.id,
      clientId: clientId,
      ...getDefaultProjectPermissions('user'),
    })
    const png = Trianglify({
      width: 600,
      height: 600,
      cell_size: 40,
      variance: '0.6',
    }).png()
    await ProjectImage.insert({
      buffer: new Buffer(png.substr(png.indexOf('base64') + 7), 'base64'),
      projectId: savedProject.id,
    })
    return savedProject
  }

  async putProject(projectId, project) {
    const createdProject = createProject({ project })
    if (projectId.toString() !== createdProject.id)
      throw new ApiError(BAD_REQUEST, 'ID in route must be equal to ID in body')
    return await Project.update(projectId, createdProject)
  }

  async deleteProject(projectId) {
    const projectImage = await ProjectImage.findOne({ projectId }, { _id: true })
    await ProjectImage.remove(projectImage.id)

    const files = await File.find({ projectId }, { _id: true })
    await Promise.all(files.map(item => File.remove(item.id)))

    const tokens = await apiTokens.getApiTokens(projectId)
    await Promise.all(tokens.map(item => apiTokens.deleteApiToken(projectId, item.id)))

    const users = await apiUsers.getUsersOfProject(projectId)
    await Promise.all(users.map(item => apiUsers.deleteUserOfProject(projectId, item.id)))

    const models = await apiModels.getModels(projectId)
    await Promise.all(models.map(item => apiModels.deleteModel(projectId, item.id)))

    await Project.remove(projectId)
  }
}

module.exports = { apiProjects: new ApiProjects() }
