import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { TaskRepository } from './task.repository';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';

const router = Router();
const repo = new TaskRepository();
const service = new TaskService(repo);
const controller = new TaskController(service);

router.use(authenticateToken);

router.get('/', controller.getTasks);
router.get('/:id', controller.getTaskById);
router.post('/', controller.createTask);
router.patch('/:id', controller.updateTask);
router.delete('/:id', controller.deleteTask);

export default router;
