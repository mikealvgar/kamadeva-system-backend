import { describe, expect, it } from 'vitest';
import {
  calculateSkipTake,
  resolvePrismaOrderBy,
} from './prisma-pagination.helper.js';
import { createPaginatedResponse } from '../dto/paginated-response.dto.js';

describe('prisma-pagination.helper', () => {
  describe('calculateSkipTake', () => {
    it('uses defaults when query is undefined or empty', () => {
      expect(calculateSkipTake()).toEqual({ skip: 0, take: 10 });
      expect(calculateSkipTake({})).toEqual({ skip: 0, take: 10 });
    });

    it('calculates 0-indexed skip properly', () => {
      expect(calculateSkipTake({ page: 0, size: 10 })).toEqual({ skip: 0, take: 10 });
      expect(calculateSkipTake({ page: 1, size: 10 })).toEqual({ skip: 10, take: 10 });
      expect(calculateSkipTake({ page: 2, size: 25 })).toEqual({ skip: 50, take: 25 });
    });

    it('clamps negative values safely', () => {
      expect(calculateSkipTake({ page: -5, size: -10 })).toEqual({ skip: 0, take: 1 });
    });
  });

  describe('resolvePrismaOrderBy', () => {
    const allowedFields = {
      nombre: 'nombre',
      name: 'nombre',
      fechaCreacion: 'createdAt',
      createdAt: 'createdAt',
    };
    const defaultOrderBy = { nombre: 'asc' as const };

    it('returns default order when sortBy is not supplied', () => {
      expect(
        resolvePrismaOrderBy({
          allowedFields,
          defaultOrderBy,
        }),
      ).toEqual({ nombre: 'asc' });
    });

    it('maps valid sortBy and direction', () => {
      expect(
        resolvePrismaOrderBy({
          sortBy: 'fechaCreacion',
          direction: 'DESC',
          allowedFields,
          defaultOrderBy,
        }),
      ).toEqual({ createdAt: 'desc' });

      expect(
        resolvePrismaOrderBy({
          sortBy: 'nombre',
          direction: 'ASC',
          allowedFields,
          defaultOrderBy,
        }),
      ).toEqual({ nombre: 'asc' });
    });

    it('falls back to default order when field is not allowed', () => {
      expect(
        resolvePrismaOrderBy({
          sortBy: 'injected_column',
          direction: 'DESC',
          allowedFields,
          defaultOrderBy,
        }),
      ).toEqual({ nombre: 'asc' });
    });
  });

  describe('createPaginatedResponse', () => {
    it('calculates totalPages and isLastPage correctly for empty sets', () => {
      const res = createPaginatedResponse({
        items: [],
        totalRecords: 0,
        page: 0,
        size: 10,
      });

      expect(res.items).toEqual([]);
      expect(res.data).toEqual([]);
      expect(res.page).toBe(0);
      expect(res.size).toBe(10);
      expect(res.totalRecords).toBe(0);
      expect(res.totalElements).toBe(0);
      expect(res.totalPages).toBe(0);
      expect(res.isLastPage).toBe(true);
      expect(res.lastPage).toBe(true);
    });

    it('calculates totalPages and isLastPage across multiple pages', () => {
      const page0 = createPaginatedResponse({
        items: [1, 2, 3],
        totalRecords: 25,
        page: 0,
        size: 10,
      });
      expect(page0.totalPages).toBe(3);
      expect(page0.isLastPage).toBe(false);

      const page2 = createPaginatedResponse({
        items: [1, 2],
        totalRecords: 25,
        page: 2,
        size: 10,
      });
      expect(page2.totalPages).toBe(3);
      expect(page2.isLastPage).toBe(true);

      const outOfBounds = createPaginatedResponse({
        items: [],
        totalRecords: 25,
        page: 5,
        size: 10,
      });
      expect(outOfBounds.totalPages).toBe(3);
      expect(outOfBounds.isLastPage).toBe(true);
    });
  });
});
