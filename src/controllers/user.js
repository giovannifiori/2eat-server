import User from '../models/user';
import Recipe from '../models/recipe';
import Review from '../models/review';
import UserRelation from '../models/userRelation';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Sequelize from 'sequelize';

const Op = Sequelize.Op;

export default class UserController {
    getAll = (req, res) => {
        User.findAll({
            attributes: ['id', 'name', 'email', 'created_at']
        }).then(users => {
            if(!users || users.length == 0){
                return res.status(404).json({ message:'No users found' });
            }
            res.status(200).json(users);
        })
        .catch(error => {
            res.status(500).json({ message: 'error', error });
        });
    };

    getById = (req, res) => {
        User.findById(req.params.id)
        .then(async user => {
            let followingQty, followersQty, average;
            await UserRelation.count({
                where: {
                    user_id: user.id
                }
            }).then(following => {
                followingQty = following;
            })
            .catch(err => {
                this.errorHandler(err, res);
            });

            await UserRelation.count({
                where: {
                    following_user_id: user.id
                }
            }).then(followers => {
                followersQty = followers;
            })
            .catch(err => {
                this.errorHandler(err, res);
            });

            await Recipe.findAll({
                where: {
                    user_id: user.id
                }
            }).then(async recipes => {
                if(!recipes || recipes.length == 0){
                    average = -1;
                }else{
                    for (let i = 0; i < recipes.length; i++) {
                        let thisRecipe = recipes[i];
                        await Review.findAndCountAll({
                            where: {
                                recipe_id: thisRecipe.id
                            }
                        }).then(result => {
                            let qty = result.count, reviews = result.rows, avg = 0;
                            for (let i = 0; i < reviews.length; i++) {
                                let review = reviews[i];
                                avg += review.grade
                            }
                            average = avg/qty;
                        })
                        .catch(error => {
                            this.errorHandler(error, res);
                        })
                    }
                }
            })
            .catch(error => {
                this.errorHandler(error, res);
            })

            user.dataValues.following = followingQty;
            user.dataValues.followers = followersQty;
            user.dataValues.average = average.toFixed(2);
            res.status(200).json(user);
        })
        .catch(error => {
            this.errorHandler(error, res);
        })
    };

    find = (req, res) => {
        User.findAll({
            where: {
                name: {
                    [Op.like]: `${req.params.name}%`
                }
            }
        })
        .then(users => {
            if(!users || users.length == 0){
                return res.status(404).json({ message: 'No users found' });
            }
            res.status(200).json(users);
        })
        .catch(
            error => this.errorHandler(error, res)
        );
    };

    create = (req, res) => {
        bcrypt.hash(req.body.password, 10, (error, hash) => {
            if(error){
                return this.errorHandler(error, res);
            }
            const data = {
                name: req.body.name,
                email: req.body.email,
                password: hash
            };
            if(req.file) {
                data.image_path = req.file.path.replace('uploads/', '');
            }
            User.create(data)
            .then(user => {
                res.status(201).json({ message: 'User created', user });
            })
            .catch(
                error => this.errorHandler(error, res)
            );
        });
    };

    validate = (req, res) => {
        if(req.userAuthData){
            return res.status(200).json(req.userAuthData);
        }else{
            return res.status(401).json({ message: 'AUTH_FAILED' });
        }
    };

    authorize = async (req, res) => {
        User.findOne({
            where: {
                email: req.body.email
            }
        })
        .then(async user => {
            if(!user){
                return res.status(401).json({ message: 'AUTH_FAILED' });
            }
            let match = await bcrypt.compare(req.body.password, user.password);

            if(match){
                const token = await jwt.sign({
                    user: req.body.email,
                    userId: user.id
                }, process.env.JWTKEY, {
                    expiresIn: "72h"
                });
                return res.status(200).json({ message: 'AUTH_SUCCESSFUL', id: user.id, name: user.name, email: user.email, token });
            }else{
                return res.status(401).json({ message: 'AUTH_FAILED' });
            }
        })
        .catch(
            error => this.errorHandler(error, res)
        );
    };

    update = async (req, res) => {
        if(req.body.password){
            req.body.password = await bcrypt.hash(req.body.password, 10);
        }

        User.update(req.body, {
            where: {
                id: req.params.id
            }
        })
        .then(user => {
            res.status(200).json({
                message: 'User updated',
                user
            })
        })
        .catch(
            error => this.errorHandler(error, res)
        );
    };

    delete = (req, res) => {

      Review.destroy({
          where: {
              user_id: req.params.id
          }
      }).then(
        Recipe.destroy({
            where: {
                user_id: req.params.id
            }
        })
      ).then(
        UserRelation.destroy({
            where:{
                user_id: req.params.id
            }
        })
      ).then(
        UserRelation.destroy({
            where:{
                following_user_id: req.params.id
            }
        })
      ).then(
        User.destroy({
            where:{
                id: req.params.id
            }
        })
      )
        .then(user => {
            res.status(200).json({
                message: 'User deleted',
                user
            })
        })
        .catch(
            error => this.errorHandler(error, res)
        );
    };

    follow = (req, res) => {
        UserRelation.create({
            user_id: req.params.id,
            following_user_id: req.params.followId
        })
        .then(result => {
            res.status(201).json({ message: 'Relation created' });
        })
        .catch(
            error => this.errorHandler(error, res)
        );
    };

    isFollowing = (req, res) => {
        UserRelation.count({
            where: {
                user_id: req.params.id,
                following_user_id: req.params.followId
            }
        })
        .then(result => {
            let status;
            status = (result) ? true : false;
            res.status(200).json({ follow: status })
        })
        .catch(
            error => this.errorHandler(error, res)
        );
    }

    unfollow = (req, res) => {
        UserRelation.destroy({
            where: {
                user_id: req.params.id,
                following_user_id: req.params.unfollowId
            }
        })
        .then(result => {
            res.status(201).json({ message: 'Relation deleted' });
        })
        .catch(
            error => this.errorHandler(error, res)
        );
    };

    getFollowing = (req, res) => {
        UserRelation.findAll({
            attributes: ['following_user_id'],
            where: {
                user_id: req.params.id,
            }
        })
        .then(following => {
            let people = [];
            for(let i=0; i<following.length; i++){
                people.push(following[i].following_user_id);
            }

            User.findAll({
                attributes: ['id', 'name', 'email', 'image_path'],
                where: {
                    id: {
                        [Op.in]: people
                    }
                }
            })
            .then(users => {
                res.status(200).json(users)
            })
            .catch(
                error => this.errorHandler(error, res)
            );
        })
        .catch(error => {
            this.errorHandler(error, res);
        });
    };

    getFollowers = (req, res) => {
        UserRelation.findAll({
            attributes: ['user_id'],
            where: {
                following_user_id: req.params.id,
            }
        })
        .then(followers => {
            let people = [];
            for(let i=0; i<followers.length; i++){
                people.push(followers[i].user_id);
            }

            User.findAll({
                attributes: ['id', 'name', 'email', 'image_path'],
                where: {
                    id: {
                        [Op.in]: people
                    }
                }
            })
            .then(users => {
                res.status(200).json(users)
            })
            .catch(
                error => this.errorHandler(error, res)
            );
        })
        .catch(error => {
            this.errorHandler(error, res);
        });
    };

    errorHandler = (err, res, statusCode = 500) => {
        return res.status(statusCode).json(err);
    }
}
