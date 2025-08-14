import { Router } from 'express';
import { requireAuth, requireDistributor } from '../lib/auth.js';
import { create, listMine, getOne, update, remove, bulkCreate } from '../controllers/productController.js';

const router = Router();

// Public product list for shopkeeper (must be defined FIRST)
import { listAllPublic } from '../controllers/productController.js';
router.get('/public', listAllPublic); // public list of all products with distributor name

// All routes below require auth and distributor role
router.use(requireAuth, requireDistributor);

router.post('/', create); // create product
router.post('/bulk', bulkCreate); // bulk create products
router.get('/', listMine); // list my products
router.get('/:id', getOne); // get single product
router.put('/:id', update); // update product fully/partially
router.delete('/:id', remove); // delete product

export default router;
